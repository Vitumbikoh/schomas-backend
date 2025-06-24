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
import { Course } from 'src/course/entities/course.entity';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
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

  async findOneByUserId(userId: string): Promise<Teacher> {
    if (!userId || !isUUID(userId)) {
      console.error('Invalid user ID:', userId);
      throw new NotFoundException('Invalid user ID');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!teacher) {
      console.error(`Teacher not found for user ID: ${userId}`);
      throw new NotFoundException(`Teacher with user ID ${userId} not found`);
    }

    console.log(
      `Found teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.id}) for user ${userId}`,
    );
    return teacher;
  }

  async findOneById(teacherId: string): Promise<Teacher> {
    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['user'],
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
    console.log(`Fetching students for teacher ID: ${teacherId}`);

    if (!isUUID(teacherId)) {
      console.error('Invalid teacher ID:', teacherId);
      throw new NotFoundException('Invalid teacher ID');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) {
      console.error(`Teacher with ID ${teacherId} not found`);
      throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
    }

    console.log(`Teacher found: ${teacher.firstName} ${teacher.lastName}`);

    const courses = await this.courseRepository.find({
      where: { teacher: { id: teacherId } },
      relations: [
        'enrollments',
        'enrollments.student',
        'enrollments.student.user',
        'enrollments.student.class',
      ],
    });

    console.log(`Found ${courses.length} courses for teacher ${teacherId}`);

    const studentsMap = new Map<string, any>();

    courses.forEach((course) => {
      console.log(
        `Processing course: ${course.name} (${course.id}) with ${course.enrollments?.length || 0} enrollments`,
      );

      if (course.enrollments && course.enrollments.length > 0) {
        course.enrollments.forEach((enrollment) => {
          const student = enrollment.student;
          if (student && !studentsMap.has(student.id)) {
            studentsMap.set(student.id, {
              id: student.id,
              firstName: student.firstName,
              lastName: student.lastName,
              email: student.user?.email || null,
              class: student.class
                ? {
                    id: student.class.id,
                    name: student.class.name,
                  }
                : null,
              courses: [],
            });
          }

          if (student) {
            const studentData = studentsMap.get(student.id);
            studentData.courses.push({
              courseId: course.id,
              courseName: course.name,
              courseCode: course.code,
              enrollmentDate: enrollment.enrollmentDate || enrollment.createdAt,
            });
          }
        });
      }
    });

    const students = Array.from(studentsMap.values());
    console.log(
      `Returning ${students.length} students for teacher ${teacherId}`,
    );
    return students;
  }

  async create(createTeacherDto: CreateTeacherDto): Promise<Teacher> {
    const validatedDto = plainToClass(CreateTeacherDto, createTeacherDto);

    const hashedPassword = await bcrypt.hash(validatedDto.password, 10);

    const user = this.userRepository.create({
      username: validatedDto.username,
      email: validatedDto.email,
      password: hashedPassword,
      role: Role.TEACHER,
    });
    await this.userRepository.save(user);

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

    Object.assign(teacher, teacherData);

    if (userData) {
      const userEntity = await this.userRepository.findOne({
        where: { id: teacher.user.id },
      });

      if (userEntity) {
        if (userData.password) {
          userEntity.password = await bcrypt.hash(userData.password, 10);
        }

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

    await this.teacherRepository.remove(teacher);

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