import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Schedule } from './entity/schedule.entity';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { Class } from 'src/classes/entity/class.entity';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(Classroom)
    private readonly classroomRepository: Repository<Classroom>,
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
  ) {}

  async create(createScheduleDto: {
    classId: string;
    day: string;
    startTime: Date;
    endTime: Date;
    courseId: string;
    teacherId: string;
    classroomId: string;
    isActive?: boolean;
  }): Promise<Schedule> {
    const course = await this.courseRepository.findOne({
      where: { id: createScheduleDto.courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { id: createScheduleDto.teacherId },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const classroom = await this.classroomRepository.findOne({
      where: { id: createScheduleDto.classroomId },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const classEntity = await this.classRepository.findOne({
      where: { id: createScheduleDto.classId },
    });
    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    // Check for schedule conflicts
    const conflict = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .where('schedule.classroomId = :classroomId', {
        classroomId: createScheduleDto.classroomId,
      }) // Use classroomId instead of classroom_id
      .andWhere('schedule.day = :day', { day: createScheduleDto.day })
      .andWhere(
        '(:startTime BETWEEN schedule.startTime AND schedule.endTime OR :endTime BETWEEN schedule.startTime AND schedule.endTime)',
        {
          startTime: createScheduleDto.startTime,
          endTime: createScheduleDto.endTime,
        },
      )
      .getOne();

    if (conflict) {
      throw new Error('Schedule conflict detected');
    }

    const schedule = this.scheduleRepository.create({
      class: classEntity,
      day: createScheduleDto.day,
      startTime: createScheduleDto.startTime,
      endTime: createScheduleDto.endTime,
      course,
      teacher,
      classroom,
      isActive: createScheduleDto.isActive ?? true,
    });

    return this.scheduleRepository.save(schedule as Schedule);
  }

  async findAll(
    options: {
      day?: string;
      teacherId?: string;
      courseId?: string;
      classId?: string;
      skip?: number;
      take?: number;
      relations?: string[];
    } = {},
  ): Promise<{ schedules: Schedule[]; pagination: any }> {
    const query = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .leftJoinAndSelect('schedule.class', 'class')
      .where('schedule.isActive = :isActive', { isActive: true });

    if (options?.day) {
      query.andWhere('schedule.day = :day', { day: options.day });
    }

    if (options?.teacherId) {
      query.andWhere('schedule.teacher_id = :teacherId', {
        teacherId: options.teacherId,
      });
    }

    if (options?.courseId) {
      query.andWhere('schedule.course_id = :courseId', {
        courseId: options.courseId,
      });
    }

    if (options?.classId) {
      query.andWhere('schedule.class_id = :classId', {
        classId: options.classId,
      });
    }

    // Get the total count before applying skip/take
    const total = await query.getCount();

    if (options?.skip) {
      query.skip(options.skip);
    }

    if (options?.take) {
      query.take(options.take);
    }

    const schedules = await query.getMany();

    return {
      schedules,
      pagination: {
        totalItems: total,
        totalPages: options.take ? Math.ceil(total / options.take) : 1,
        itemsPerPage: options.take || total,
        currentPage:
          options.skip && options.take
            ? Math.floor(options.skip / options.take) + 1
            : 1,
      },
    };
  }

  async getDashboardOverview() {
    try {
      const [schedules, totalClasses, upcomingClasses] = await Promise.all([
        this.scheduleRepository.find({
          where: { isActive: true },
          relations: ['course', 'teacher', 'classroom', 'class'],
          take: 10,
          order: { createdAt: 'DESC' },
        }),
        this.scheduleRepository.count({ where: { isActive: true } }),
        this.scheduleRepository.count({
          where: {
            isActive: true,
            startTime: MoreThan(new Date()),
          },
        }),
      ]);

      const teacherCount = await this.scheduleRepository
        .createQueryBuilder('schedule')
        .select('COUNT(DISTINCT schedule.teacherId)', 'count') // Check if teacherId is correct
        .where('schedule.isActive = :isActive', { isActive: true })
        .getRawOne();

      const classroomCount = await this.scheduleRepository
        .createQueryBuilder('schedule')
        .select('COUNT(DISTINCT schedule.classroomId)', 'count') // Check if classroomId is correct
        .where('schedule.isActive = :isActive', { isActive: true })
        .getRawOne();

      return {
        schedules,
        stats: {
          totalClasses,
          upcomingClasses,
          teachersAssigned: parseInt(teacherCount.count) || 0,
          roomsUtilized: parseInt(classroomCount.count) || 0,
        },
        uiConfig: {
          title: 'Schedule Management',
          description: 'Manage class schedules and timetables',
          primaryColor: '#000000',
          breadcrumbs: [
            { name: 'Dashboard', path: '/dashboard/admin/dashboard' },
            { name: 'Schedule Management', path: '' },
          ],
        },
      };
    } catch (error) {
      console.error('Error in getDashboardOverview:', error);
      throw error;
    }
  }

  async findOne(
    id: string,
    relations: string[] = ['course', 'teacher', 'classroom', 'class'],
  ): Promise<Schedule> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id },
      relations,
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
  }

  async update(
    id: string,
    updateScheduleDto: {
      day?: string;
      startTime?: Date;
      endTime?: Date;
      courseId?: string;
      teacherId?: string;
      classroomId?: string;
      classId?: string;
      isActive?: boolean;
    },
  ): Promise<Schedule> {
    const schedule = await this.scheduleRepository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (updateScheduleDto.courseId) {
      const course = await this.courseRepository.findOne({
        where: { id: updateScheduleDto.courseId },
      });
      if (!course) {
        throw new NotFoundException('Course not found');
      }
      schedule.course = course;
    }

    if (updateScheduleDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({
        where: { id: updateScheduleDto.teacherId },
      });
      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }
      schedule.teacher = teacher;
    }

    if (updateScheduleDto.classroomId) {
      const classroom = await this.classroomRepository.findOne({
        where: { id: updateScheduleDto.classroomId },
      });
      if (!classroom) {
        throw new NotFoundException('Classroom not found');
      }
      schedule.classroom = classroom;
    }

    if (updateScheduleDto.classId) {
      const classEntity = await this.classRepository.findOne({
        where: { id: updateScheduleDto.classId },
      });
      if (!classEntity) {
        throw new NotFoundException('Class not found');
      }
      schedule.class = classEntity;
    }

    Object.assign(schedule, updateScheduleDto);
    return this.scheduleRepository.save(schedule);
  }

  async remove(id: string): Promise<void> {
    const result = await this.scheduleRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Schedule not found');
    }
  }

  async findByTeacher(teacherId: string): Promise<Schedule[]> {
    return this.scheduleRepository.find({
      where: { teacher: { id: teacherId }, isActive: true },
      relations: ['course', 'teacher', 'classroom', 'class'],
    });
  }

  async findByCourse(courseId: string): Promise<Schedule[]> {
    return this.scheduleRepository.find({
      where: { course: { id: courseId }, isActive: true },
      relations: ['course', 'teacher', 'classroom', 'class'],
    });
  }
}
