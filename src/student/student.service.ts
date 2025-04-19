import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Parent } from '../user/entities/parent.entity';
import { UpdateStudentDto } from './dto/update-student.dto';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/user/enums/role.enum';
import { plainToClass } from 'class-transformer';
import { CreateStudentDto } from 'src/user/dtos/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
  ) {}

  async createStudent(createStudentDto: CreateStudentDto): Promise<Student> {
    // Validate and transform DTO
    const validatedDto = plainToClass(CreateStudentDto, createStudentDto);

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedDto.password, 10);

    // Create user first
    const user = this.userRepository.create({
      username: validatedDto.username,
      email: validatedDto.email,
      password: hashedPassword,
      role: Role.STUDENT,
    });
    await this.userRepository.save(user);

    // Parse date if it exists
    const dateOfBirth = validatedDto.dateOfBirth
      ? new Date(validatedDto.dateOfBirth)
      : null;

    // Create student
    const student = this.studentRepository.create({
      firstName: validatedDto.firstName,
      lastName: validatedDto.lastName,
      phoneNumber: validatedDto.phoneNumber,
      address: validatedDto.address,
      dateOfBirth: dateOfBirth,
      gender: validatedDto.gender,
      gradeLevel: validatedDto.gradeLevel,
      user: user,
    });

    // Set parent if provided
    if (validatedDto.parentId) {
      const parent = await this.parentRepository.findOne({
        where: { id: String(validatedDto.parentId) },
      });
      if (parent) {
        student.parent = parent;
      }
    }

    return this.studentRepository.save(student);
  }

  async findByUserId(userId: string): Promise<Student | null> {
    return this.studentRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user']
    });
  }

  async create(createStudentDto: CreateStudentDto): Promise<Student> {
    return this.createStudent(createStudentDto);
  }

  async count(
    whereConditions: FindManyOptions<Student>['where'],
  ): Promise<number> {
    return this.studentRepository.count({ where: whereConditions });
  }

  async findOne(id: string) {
    const student = await this.studentRepository.findOne({
      where: { id },
      relations: ['user', 'parent'],
    });

    if (!student) {
      throw new NotFoundException(`Student with ID ${id} not found`);
    }
    return student;
  }

  async findAndCount(
    options: FindManyOptions<Student>,
  ): Promise<[Student[], number]> {
    return this.studentRepository.findAndCount({
      ...options,
      relations: ['user', 'parent'],
    });
  }

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
  ): Promise<Student> {
    const student = await this.findOne(id);
    const { user, parentId, ...studentData } = updateStudentDto;

    // Handle dateOfBirth update
    if (updateStudentDto.dateOfBirth) {
      studentData.dateOfBirth = new Date(
        updateStudentDto.dateOfBirth,
      ).toISOString();
    }

    // Update student data
    Object.assign(student, studentData);

    // Update associated user data if provided
    if (user) {
      const userEntity = await this.userRepository.findOne({
        where: { id: student.user.id },
      });
      if (userEntity) {
        Object.assign(userEntity, user);
        await this.userRepository.save(userEntity);
      }
    }

    // Update parent if provided
    if (parentId) {
      const parent = await this.parentRepository.findOne({
        where: { id: String(parentId) },
      });
      if (!parent) {
        throw new NotFoundException('Parent not found');
      }
      student.parent = parent;
    }

    return this.studentRepository.save(student);
  }

  async findAll(options?: FindManyOptions<Student>): Promise<Student[]> {
    return this.studentRepository.find({
      ...options,
      relations: ['user', 'parent'],
    });
  }

  async remove(id: string): Promise<void> {
    const student = await this.findOne(id);
    await this.studentRepository.remove(student);

    // Also remove the associated user
    if (student.user) {
      await this.userRepository.remove(student.user);
    }
  }

  async getStudentProfile(id: string): Promise<Student> {
    return this.findOne(id);
  }

  // Add this to students.service.ts
 async getStudentCourses(studentId: string) {
  // First verify the student exists
  const student = await this.studentRepository.findOne({
    where: { id: studentId }
  });

  if (!student) {
    throw new NotFoundException('Student not found');
  }

  // Now fetch courses with relations
  return this.studentRepository.findOne({
    where: { id: studentId },
    relations: [
      'enrollments',
      'enrollments.course',
      'enrollments.course.teacher'
    ],
  }).then(student => {
    if (!student) return { completed: [], active: [], upcoming: [] };

    const now = new Date();
    const courses = student.enrollments.map(enrollment => ({
      ...enrollment.course,
      enrollmentStatus: enrollment.status,
      enrollmentDate: enrollment.enrollmentDate,
      teacherName: enrollment.course.teacher 
        ? `${enrollment.course.teacher.firstName} ${enrollment.course.teacher.lastName}`
        : 'Not assigned',
    }));

    return {
      completed: courses.filter(course => 
        course.status === 'inactive' || 
        (course.endDate && new Date(course.endDate) < now) ||
        course.enrollmentStatus === 'completed'
      ),
      active: courses.filter(course => 
        course.status === 'active' && 
        (!course.endDate || new Date(course.endDate) >= now) &&
        course.enrollmentStatus === 'active'
      ),
      upcoming: courses.filter(course => 
        course.status === 'upcoming' && 
        (!course.startDate || new Date(course.startDate) > now) &&
        course.enrollmentStatus === 'active'
      ),
    };
  });
}
}
