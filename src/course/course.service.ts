// src/course/course.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Like, Repository, In } from 'typeorm';
import { Course } from './entities/course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Student } from 'src/user/entities/student.entity';
import { Class } from 'src/classes/entity/class.entity';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,

    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
  ) {}

  async findAll(
    options: {
      skip?: number;
      take?: number;
      where?: FindOptionsWhere<Course> | FindOptionsWhere<Course>[];
      relations?: string[];
      schoolId?: string;
      superAdmin?: boolean;
    } = {},
  ): Promise<Course[]> {
    const qb = this.courseRepository.createQueryBuilder('course')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .leftJoinAndSelect('course.class', 'class');

    if (options.schoolId && !options.superAdmin) {
      qb.andWhere('course.schoolId = :schoolId', { schoolId: options.schoolId });
    }

    if (options.where) {
      // Basic handling for simple LIKE searches already prepared outside
      // Complex OR conditions can be appended by caller via custom methods
    }

    if (options.skip) qb.skip(options.skip);
    if (options.take) qb.take(options.take);
    qb.orderBy('course.createdAt', 'DESC');
    return qb.getMany();
  }

  async count(
    where?: FindOptionsWhere<Course> | FindOptionsWhere<Course>[],
  ): Promise<number> {
    return await this.courseRepository.count({ where });
  }

  async findOne(
    id: string,
    relations: string[] = ['teacher', 'class'],
  ): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id },
      relations,
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }
    return course;
  }


  async findStudentsByClass(classId: string): Promise<Student[]> {
    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
      relations: ['students', 'students.user'], // Load students and their user relation
    });

    if (!classEntity) {
      throw new NotFoundException(`Class with ID ${classId} not found`);
    }

    return classEntity.students || [];
  }
  
  async create(createCourseDto: CreateCourseDto, schoolId?: string): Promise<Course> {
    const course = new Course();
    Object.assign(course, createCourseDto);
    if (schoolId) course.schoolId = schoolId;

    if (createCourseDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({
        where: { id: createCourseDto.teacherId },
      });

      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }
      course.teacher = teacher;
    }

  return this.courseRepository.save(course); // This will generate a UUID
  }

  async update(id: string, updateCourseDto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id, ['teacher']);

    if (updateCourseDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({
        where: { id: updateCourseDto.teacherId },
      });

      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }
      course.teacher = teacher;
      delete updateCourseDto.teacherId;
    }

    this.courseRepository.merge(course, updateCourseDto);
    return this.courseRepository.save(course);
  }

  async remove(id: string): Promise<void> {
    const course = await this.findOne(id);
    await this.courseRepository.remove(course);
  }

  async assignTeacher(courseId: string, teacherId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['teacher'], // Include teacher in the query
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    course.teacher = teacher;
    course.teacherId = teacher.id; // Explicitly set the teacherId

    await this.courseRepository.save(course);

    // Reload the course to ensure all relations are properly loaded
    const updatedCourse = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['teacher', 'teacher.user'],
    });

    if (!updatedCourse) {
      throw new NotFoundException('Course not found after assigning teacher');
    }

    return updatedCourse;
  }

  async searchCourses(query: string): Promise<Course[]> {
    return await this.courseRepository.find({
      where: [
        { name: Like(`%${query}%`) },
        { code: Like(`%${query}%`) },
        { description: Like(`%${query}%`) },
      ],
      relations: ['teacher'],
      take: 10,
    });
  }

  async findActiveCourses(): Promise<Course[]> {
    return await this.courseRepository.find({
      where: { status: 'active' },
      relations: ['teacher'],
      order: { name: 'ASC' },
    });
  }

  async findByClass(classId: string): Promise<Teacher[]> {
    const courses = await this.courseRepository.find({
      where: { class: { id: classId } },
      relations: ['teacher'],
    });
    const teachers = courses
      .map(course => course.teacher)
      .filter((teacher, index, self) => teacher && self.findIndex(t => t.id === teacher.id) === index);
    if (teachers.length === 0) {
      return [];
    }
    // Optionally, load 'user' relation for each teacher
    return this.teacherRepository.find({
      where: { id: In(teachers.map(t => t.id)) },
      relations: ['user'],
    });
  }

  async getCourseEnrollments(courseId: string): Promise<any[]> {
    // Adjust the relation names and entity as per your actual model
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['enrollments', 'enrollments.student'],
    });
    if (!course) {
      return [];
    }
    return course.enrollments || [];
  }
}
