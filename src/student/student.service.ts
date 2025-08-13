import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
import { SettingsService } from 'src/settings/settings.service';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    private readonly settingsService: SettingsService,
    
  ) {}

  async createStudent(createStudentDto: CreateStudentDto): Promise<Student> {
    this.logger.log(`Creating student with email: ${createStudentDto.email}`);
    const validatedDto = plainToClass(CreateStudentDto, createStudentDto);
    const hashedPassword = await bcrypt.hash(validatedDto.password, 10);

    // Get the current academic year
    const academicYear = await this.settingsService.getCurrentAcademicYear();
    if (!academicYear) {
        throw new NotFoundException('No current academic year found');
    }

    // Create user first
    const user = this.userRepository.create({
      username: validatedDto.username,
      email: validatedDto.email,
      password: hashedPassword,
      role: Role.STUDENT,
    });
    await this.userRepository.save(user);
    this.logger.log(`Created user with ID: ${user.id}`);

    // Generate student ID
    const studentId = await this.generateStudentId();

    const dateOfBirth = validatedDto.dateOfBirth
      ? new Date(validatedDto.dateOfBirth)
      : null;

    const studentData: Partial<Student> = {
      studentId,
      firstName: validatedDto.firstName,
      lastName: validatedDto.lastName,
      phoneNumber: validatedDto.phoneNumber,
      address: validatedDto.address,
      dateOfBirth: dateOfBirth,
      gender: validatedDto.gender,
      gradeLevel: validatedDto.gradeLevel,
      user: user,
      userId: user.id,
      academicYearId: academicYear.id, 
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
      } else {
        this.logger.warn(`Parent with ID ${validatedDto.parentId} not found`);
      }
    }

    const savedStudent = await this.studentRepository.save(student);
    this.logger.log(`Created student with ID: ${savedStudent.id}, studentId: ${savedStudent.studentId}`);
    return savedStudent;
  }

  private async generateStudentId(): Promise<string> {
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const latestStudent = await this.studentRepository
      .createQueryBuilder('student')
      .where('student.studentId LIKE :year', { year: `${currentYear}%` })
      .orderBy('student.studentId', 'DESC')
      .getOne();

    let sequenceNumber = 1;
    if (latestStudent?.studentId) {
      const lastSeq = parseInt(latestStudent.studentId.slice(-4), 10);
      sequenceNumber = lastSeq + 1;
    }

    const formattedSeq = sequenceNumber.toString().padStart(4, '0');
    return `${currentYear}${formattedSeq}`;
  }

  async getStudentSchedule(
    userId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ schedules: any[]; total: number }> {
    this.logger.log(`Fetching schedule for userId: ${userId}`);
    const student = await this.studentRepository.findOne({
      where: { user: { id: userId } },
      relations: ['enrollments', 'enrollments.course'],
    });

    if (!student) {
      this.logger.error(`Student not found for userId: ${userId}`);
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

    this.logger.log(`Fetched ${total} schedules for userId: ${userId}`);
    return { schedules: formattedSchedules, total };
  }

  async findByUserId(userId: string): Promise<Student | null> {
    this.logger.log(`Finding student by userId: ${userId}`);
    const student = await this.studentRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!student) {
      this.logger.warn(`No student found for userId: ${userId}`);
    }
    return student;
  }

  async findByClass(classId: string): Promise<Student[]> {
    this.logger.log(`Finding students by classId: ${classId}`);
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
    this.logger.log(`Finding student by id: ${id}`);
    const student = await this.studentRepository.findOne({
      where: { id },
      relations: ['user', 'parent'],
    });

    if (!student) {
      this.logger.error(`Student with ID ${id} not found`);
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
    this.logger.log(`Updating student with id: ${id}`);
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
        this.logger.warn(`Parent with ID ${parentId} not found`);
        throw new NotFoundException('Parent not found');
      }
      student.parent = parent;
    }

    const savedStudent = await this.studentRepository.save(student);
    this.logger.log(`Updated student with id: ${id}`);
    return savedStudent;
  }

  async findAll(options?: FindManyOptions<Student>): Promise<Student[]> {
    return this.studentRepository.find({
      ...options,
      relations: ['user', 'parent'],
    });
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing student with id: ${id}`);
    const student = await this.findOne(id);
    await this.studentRepository.remove(student);

    if (student.user) {
      await this.userRepository.remove(student.user);
    }
    this.logger.log(`Removed student with id: ${id}`);
  }

  async getStudentProfile(id: string): Promise<Student> {
    return this.findOne(id);
  }

  async getStudentCourses(userId: string) {
    this.logger.log(`Fetching courses for userId: ${userId}`);
    try {
      const student = await this.studentRepository.findOne({
        where: { user: { id: userId } },
        relations: [
          'enrollments',
          'enrollments.course',
          'enrollments.course.teacher',
          'enrollments.course.class',
        ],
      });

      if (!student) {
        this.logger.error(`Student not found for userId: ${userId}`);
        throw new NotFoundException('Student not found');
      }

      const now = new Date();
      const courses = student.enrollments.map((enrollment) => {
        const course = enrollment.course;
        return {
          id: course.id,
          code: course.code,
          name: course.name,
          description: course.description || 'No description available',
          status: course.status,
          enrollmentStatus: enrollment.status,
          enrollmentDate: enrollment.enrollmentDate,
          startDate: course.startDate ? new Date(course.startDate) : null,
          endDate: course.endDate ? new Date(course.endDate) : null,
          teacherName: course.teacher
            ? `${course.teacher.firstName} ${course.teacher.lastName}`
            : 'Not assigned',
          schedule: course.schedule || { days: [], time: '', location: '' },
          className: course.class ? course.class.name : 'Not assigned',
        };
      });

      const result = {
        completed: courses.filter(
          (course) =>
            course.status === 'inactive' ||
            (course.endDate && course.endDate < now) ||
            course.enrollmentStatus === 'completed',
        ),
        active: courses.filter(
          (course) =>
            course.status === 'active' &&
            (!course.endDate || course.endDate >= now) &&
            course.enrollmentStatus === 'active',
        ),
        upcoming: courses.filter(
          (course) =>
            course.status === 'upcoming' &&
            (!course.startDate || course.startDate > now) &&
            course.enrollmentStatus === 'active',
        ),
      };

      this.logger.log(`Fetched ${courses.length} courses for userId: ${userId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error fetching courses for userId: ${userId}: ${error.message}`);
      throw error;
    }
  }
  
}