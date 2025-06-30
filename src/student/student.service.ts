import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository, Like } from 'typeorm';
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Parent } from '../user/entities/parent.entity';
import { Schedule } from '../schedule/entity/schedule.entity';
import { UpdateStudentDto } from './dto/update-student.dto';
import { CreateStudentDto } from 'src/user/dtos/create-student.dto';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/user/enums/role.enum';
import { plainToClass } from 'class-transformer';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
  ) {}

  async createStudent(createStudentDto: CreateStudentDto): Promise<Student> {
    const validatedDto = plainToClass(CreateStudentDto, createStudentDto);
    const hashedPassword = await bcrypt.hash(validatedDto.password, 10);

    const user = this.userRepository.create({
      username: validatedDto.username,
      email: validatedDto.email,
      password: hashedPassword,
      role: Role.STUDENT,
    });
    await this.userRepository.save(user);

    const dateOfBirth = validatedDto.dateOfBirth
      ? new Date(validatedDto.dateOfBirth)
      : null;

    const studentData: Partial<Student> = {
      firstName: validatedDto.firstName,
      lastName: validatedDto.lastName,
      phoneNumber: validatedDto.phoneNumber,
      address: validatedDto.address,
      dateOfBirth: dateOfBirth,
      gender: validatedDto.gender,
      gradeLevel: validatedDto.gradeLevel,
      user: user,
    };

    if (validatedDto.classId) {
      studentData.classId = validatedDto.classId;
    }

    const student = this.studentRepository.create(studentData);

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

  async getStudentSchedule(
    userId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ schedules: any[]; total: number }> {
    const student = await this.studentRepository.findOne({
      where: { user: { id: userId } },
      relations: ['enrollments', 'enrollments.course'],
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const courseIds = student.enrollments.map(enrollment => enrollment.course.id);

    const skip = (page - 1) * limit;
    const query = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .leftJoinAndSelect('schedule.class', 'class')
      .where('schedule.courseId IN (:...courseIds)', { courseIds })
      .andWhere('schedule.isActive = :isActive', { isActive: true });

    if (search) {
      query.andWhere(
        '(course.name LIKE :search OR classroom.name LIKE :search OR class.name LIKE :search OR teacher.firstName LIKE :search OR teacher.lastName LIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [schedules, total] = await query
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const formattedSchedules = schedules.map(schedule => ({
      id: schedule.id,
      date: schedule.date,
      day: schedule.day,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      course: schedule.course
        ? { id: schedule.course.id, name: schedule.course.name, code: schedule.course.code }
        : null,
      teacher: schedule.teacher
        ? { name: `${schedule.teacher.firstName} ${schedule.teacher.lastName}` }
        : null,
      classroom: schedule.classroom
        ? { id: schedule.classroom.id, name: schedule.classroom.name, code: schedule.classroom.code }
        : null,
      class: schedule.class
        ? { id: schedule.class.id, name: schedule.class.name }
        : null,
    }));

    return { schedules: formattedSchedules, total };
  }

  async findByUserId(userId: string): Promise<Student | null> {
    return this.studentRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async findByClass(classId: string): Promise<Student[]> {
    return this.studentRepository.find({
      where: { classId },
      relations: ['user'],
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
      relations: ['user', 'parent', 'class'],
    });
  }

  async getTotalStudentsCount(activeOnly?: boolean): Promise<number> {
    const options: FindManyOptions<Student> = {};
    if (activeOnly) {
      // Assuming there's no 'isActive' field; adjust if needed
    }
    return this.studentRepository.count(options);
  }

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
  ): Promise<Student> {
    const student = await this.findOne(id);
    const { user, parentId, ...studentData } = updateStudentDto;

    if (updateStudentDto.dateOfBirth) {
      studentData.dateOfBirth = new Date(
        updateStudentDto.dateOfBirth,
      ).toISOString();
    }

    Object.assign(student, studentData);

    if (user) {
      const userEntity = await this.userRepository.findOne({
        where: { id: student.user.id },
      });
      if (userEntity) {
        Object.assign(userEntity, user);
        await this.userRepository.save(userEntity);
      }
    }

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

    if (student.user) {
      await this.userRepository.remove(student.user);
    }
  }

  async getStudentProfile(id: string): Promise<Student> {
    return this.findOne(id);
  }

  async getStudentCourses(studentId: string) {
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.studentRepository
      .findOne({
        where: { id: studentId },
        relations: [
          'enrollments',
          'enrollments.course',
          'enrollments.course.teacher',
        ],
      })
      .then((student) => {
        if (!student) return { completed: [], active: [], upcoming: [] };

        const now = new Date();
        const courses = student.enrollments.map((enrollment) => ({
          ...enrollment.course,
          enrollmentStatus: enrollment.status,
          enrollmentDate: enrollment.enrollmentDate,
          teacherName: enrollment.course.teacher
            ? `${enrollment.course.teacher.firstName} ${enrollment.course.teacher.lastName}`
            : 'Not assigned',
        }));

        return {
          completed: courses.filter(
            (course) =>
              course.status === 'inactive' ||
              (course.endDate && new Date(course.endDate) < now) ||
              course.enrollmentStatus === 'completed',
          ),
          active: courses.filter(
            (course) =>
              course.status === 'active' &&
              (!course.endDate || new Date(course.endDate) >= now) &&
              course.enrollmentStatus === 'active',
          ),
          upcoming: courses.filter(
            (course) =>
              course.status === 'upcoming' &&
              (!course.startDate || new Date(course.startDate) > now) &&
              course.enrollmentStatus === 'active',
          ),
        };
      });
  }
}