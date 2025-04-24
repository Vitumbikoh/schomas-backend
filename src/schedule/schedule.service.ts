// schedule.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Schedule } from './entity/schedule.entity';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Classroom } from 'src/classroom/entity/classroom.entity';

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
  ) {}

  async create(createScheduleDto: {
    day: string;
    startTime: Date;
    endTime: Date;
    courseId: string;
    teacherId: string;
    classroomId: string;
    isActive?: boolean;
  }): Promise<Schedule> {
    const course = await this.courseRepository.findOne({ where: { id: createScheduleDto.courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const teacher = await this.teacherRepository.findOne({ where: { id: createScheduleDto.teacherId } });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const classroom = await this.classroomRepository.findOne({ where: { id: createScheduleDto.classroomId } });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    // Check for schedule conflicts
    const conflict = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .where('schedule.classroom_id = :classroomId', { classroomId: createScheduleDto.classroomId })
      .andWhere('schedule.day = :day', { day: createScheduleDto.day })
      .andWhere(
        '(:startTime BETWEEN schedule.start_time AND schedule.end_time OR :endTime BETWEEN schedule.start_time AND schedule.end_time)',
        { startTime: createScheduleDto.startTime, endTime: createScheduleDto.endTime },
      )
      .getOne();

    if (conflict) {
      throw new Error('Schedule conflict detected');
    }

    const schedule = this.scheduleRepository.create({
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

  async findAll(options: {
    day?: string;
    teacherId?: string;
    courseId?: string;
    skip?: number;
    take?: number;
    relations?: string[];
  } = {}): Promise<Schedule[]> {
    const query = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .where('schedule.isActive = :isActive', { isActive: true });

    if (options?.day) {
      query.andWhere('schedule.day = :day', { day: options.day });
    }

    if (options?.teacherId) {
      query.andWhere('schedule.teacher_id = :teacherId', { teacherId: options.teacherId });
    }

    if (options?.courseId) {
      query.andWhere('schedule.course_id = :courseId', { courseId: options.courseId });
    }

    if (options?.skip) {
      query.skip(options.skip);
    }

    if (options?.take) {
      query.take(options.take);
    }

    return query.getMany();
  }

  async getDashboardOverview(): Promise<{
    schedules: Schedule[];
    stats: {
      totalClasses: number;
      upcomingClasses: number;
      teachersAssigned: number;
      roomsUtilized: number;
    };
    uiConfig: {
      title: string;
      description: string;
      primaryColor: string;
      breadcrumbs: { name: string; path: string }[];
    };
  }> {
    const [schedules, totalClasses, upcomingClasses] = await Promise.all([
      this.scheduleRepository.find({
        where: { isActive: true },
        relations: ['course', 'teacher', 'classroom'],
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
      .select('COUNT(DISTINCT schedule.teacher_id)', 'count')
      .where('schedule.isActive = :isActive', { isActive: true })
      .getRawOne();

    const classroomCount = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .select('COUNT(DISTINCT schedule.classroom_id)', 'count')
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
  }

  async findOne(id: string, relations: string[] = ['course', 'teacher', 'classroom']): Promise<Schedule> {
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
      isActive?: boolean;
    },
  ): Promise<Schedule> {
    const schedule = await this.scheduleRepository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (updateScheduleDto.courseId) {
      const course = await this.courseRepository.findOne({ where: { id: updateScheduleDto.courseId } });
      if (!course) {
        throw new NotFoundException('Course not found');
      }
      schedule.course = course;
    }

    if (updateScheduleDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({ where: { id: updateScheduleDto.teacherId } });
      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }
      schedule.teacher = teacher;
    }

    if (updateScheduleDto.classroomId) {
      const classroom = await this.classroomRepository.findOne({ where: { id: updateScheduleDto.classroomId } });
      if (!classroom) {
        throw new NotFoundException('Classroom not found');
      }
      schedule.classroom = classroom;
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
      relations: ['course', 'teacher', 'classroom'],
    });
  }

  async findByCourse(courseId: string): Promise<Schedule[]> {
    return this.scheduleRepository.find({
      where: { course: { id: courseId }, isActive: true },
      relations: ['course', 'teacher', 'classroom'],
    });
  }
}