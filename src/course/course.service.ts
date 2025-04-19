// src/course/course.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { User } from '../user/entities/user.entity';
import { Role } from 'src/user/enums/role.enum';
import { Teacher } from 'src/user/entities/teacher.entity';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
  ) {}



  async findAll(options: {
    skip?: number;
    take?: number;
    where?: FindOptionsWhere<Course> | FindOptionsWhere<Course>[];
    relations?: string[];
  } = {}): Promise<Course[]> {
    return await this.courseRepository.find({
      skip: options.skip || 0,
      take: options.take || 10,
      where: options.where || {},
      relations: options.relations || ['teacher'],
      order: { createdAt: 'DESC' },
    });
  }

  async count(where?: FindOptionsWhere<Course> | FindOptionsWhere<Course>[]): Promise<number> {
    return await this.courseRepository.count({ where });
  }

  async findOne(id: string, relations: string[] = ['teacher']): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id },
      relations,
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }
    return course;
  }

  async create(createCourseDto: CreateCourseDto): Promise<Course> {
    const course = new Course();
    Object.assign(course, createCourseDto);
    
    if (createCourseDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({ 
        where: { id: createCourseDto.teacherId }
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
        where: { id: updateCourseDto.teacherId }
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
        relations: ['teacher'] // Include teacher in the query
    });
    
    if (!course) {
        throw new NotFoundException('Course not found');
    }

    const teacher = await this.teacherRepository.findOne({ 
        where: { id: teacherId },
        relations: ['user']
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
        relations: ['teacher', 'teacher.user']
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
}