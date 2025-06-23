import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Repository } from 'typeorm';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { Teacher } from '../user/entities/teacher.entity';
import { CreateTeacherDto } from '../user/dtos/create-teacher.dto';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/user/enums/role.enum';
import { plainToClass } from 'class-transformer';
import { isUUID } from 'class-validator';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findOne(id: string): Promise<Teacher> {
    if (!isUUID(id)) {
      throw new NotFoundException('Invalid teacher ID format');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    return teacher;
  }
  // src/teacher/teacher.service.ts
  async findOneByUserId(userId: string): Promise<Teacher> {
    const teacher = await this.teacherRepository.findOne({
      where: { user: { id: userId } }, // Changed to look up by user.id
      relations: ['user'],
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with user ID ${userId} not found`);
    }

    return teacher;
  }

  // src/teacher/teacher.service.ts
  async findOneById(teacherId: string): Promise<Teacher> {
    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId }, // Look up by teacher.id (primary key)
      relations: ['user'], // Include user relation if needed
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
    }

    return teacher;
  }

  async findAll(options?: {
    skip?: number;
    take?: number;
    where?: any;
  }): Promise<Teacher[]> {
    return this.teacherRepository.find({
      relations: ['user'],
      ...options,
    });
  }

  async count(whereConditions: any): Promise<number> {
    return this.teacherRepository.count({
      where: whereConditions,
      relations: ['user'],
    });
  }

  async getStudentsForTeacher(teacherId: string) {
    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: [
        'courses',
        'courses.students',
        'courses.students.user',
        'courses.students.class',
      ],
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
    }

    if (!teacher.courses || teacher.courses.length === 0) {
      return []; // Return empty array if teacher has no courses
    }

    // Collect all unique students
    const studentsMap = new Map<string, any>();

    teacher.courses.forEach((course) => {
      course.students?.forEach((student) => {
        if (!studentsMap.has(student.id)) {
          studentsMap.set(student.id, {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.user?.email,
            class: student.class ? { name: student.class.name } : undefined,
          });
        }
      });
    });

    return Array.from(studentsMap.values());
  }

  async create(createTeacherDto: CreateTeacherDto): Promise<Teacher> {
    const validatedDto = plainToClass(CreateTeacherDto, createTeacherDto);

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedDto.password, 10);

    // Create User First
    const user = this.userRepository.create({
      username: validatedDto.username,
      email: validatedDto.email,
      password: hashedPassword,
      role: Role.TEACHER,
    });
    await this.userRepository.save(user);

    // Create Teacher with User Reference
    const teacher = this.teacherRepository.create({
      firstName: validatedDto.firstName,
      lastName: validatedDto.lastName,
      phoneNumber: validatedDto.phoneNumber,
      address: validatedDto.address,
      qualification: validatedDto.qualification,
      subjectSpecialization: validatedDto.subjectSpecialization,
      dateOfBirth: validatedDto.dateOfBirth,
      gender: validatedDto.gender,
      hireDate: validatedDto.hireDate,
      yearsOfExperience: validatedDto.yearsOfExperience,
      status: validatedDto.status || 'active',
      user: user,
    });

    return await this.teacherRepository.save(teacher);
  }

  async update(
    id: string,
    updateTeacherDto: UpdateTeacherDto,
  ): Promise<Teacher> {
    if (!isUUID(id)) {
      throw new NotFoundException('Invalid teacher ID format');
    }

    const teacher = await this.findOne(id);
    const { user: userData, ...teacherData } = updateTeacherDto;

    // Update teacher fields
    Object.assign(teacher, teacherData);

    if (userData) {
      const userEntity = await this.userRepository.findOne({
        where: { id: teacher.user.id },
      });

      if (userEntity) {
        // Handle password if provided
        if (userData.password) {
          userEntity.password = await bcrypt.hash(userData.password, 10);
        }

        // Update other user fields
        const { password, ...otherUserData } = userData;
        Object.assign(userEntity, otherUserData);

        await this.userRepository.save(userEntity);
      }
    }

    return this.teacherRepository.save(teacher);
  }

  async remove(id: string): Promise<void> {
    if (!isUUID(id)) {
      throw new NotFoundException('Invalid teacher ID format');
    }

    const teacher = await this.findOne(id);

    // Remove teacher first to maintain referential integrity
    await this.teacherRepository.remove(teacher);

    // Then remove the associated user
    if (teacher.user) {
      await this.userRepository.remove(teacher.user);
    }
  }

  async getTeacherProfile(teacherId: string): Promise<Teacher> {
    return this.findOne(teacherId);
  }

  async findTeachersByIds(userIds: string[]): Promise<Teacher[]> {
    if (!userIds.every((id) => isUUID(id))) {
      throw new NotFoundException('One or more invalid teacher IDs');
    }

    return this.teacherRepository.find({
      where: userIds.map((id) => ({ user: { id } })),
      relations: ['user'],
    });
  }
}
