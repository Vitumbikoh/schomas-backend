import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Repository, Like } from 'typeorm';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { Teacher } from '../user/entities/teacher.entity';
import { CreateTeacherDto } from '../user/dtos/create-teacher.dto';
import { Schedule } from '../schedule/entity/schedule.entity';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/user/enums/role.enum';
import { plainToClass } from 'class-transformer';
import { isUUID } from 'class-validator';
import { Course } from 'src/course/entities/course.entity';
import { Class } from 'src/classes/entity/class.entity';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
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

  async findAllPaginated(
    page: number,
    limit: number,
    search?: string,
  ): Promise<[Teacher[], number]> {
    const skip = (page - 1) * limit;
    const where = search
      ? [
          { firstName: Like(`%${search}%`) },
          { lastName: Like(`%${search}%`) },
          { user: { email: Like(`%${search}%`) } },
        ]
      : {};

    const [teachers, total] = await this.teacherRepository.findAndCount({
      where,
      relations: ['user'],
      skip,
      take: limit,
    });

    console.log(`Found ${teachers.length} teachers, total: ${total}`);
    return [teachers, total];
  }

  async getSchedulesForTeacher(
    teacherId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ schedules: any[]; total: number }> {
    console.log(`Fetching schedules for teacher ID: ${teacherId}`);

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

    const skip = (page - 1) * limit;
    const query = this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .leftJoinAndSelect('schedule.class', 'class')
      .where('schedule.teacherId = :teacherId', { teacherId })
      .andWhere('schedule.isActive = :isActive', { isActive: true });

    if (search) {
      query.andWhere(
        '(course.name LIKE :search OR classroom.name LIKE :search OR class.name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [schedules, total] = await query
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    console.log(`Found ${schedules.length} schedules, total: ${total}`);

    const formattedSchedules = schedules.map((schedule) => ({
      id: schedule.id,
      date: schedule.date,
      day: schedule.day,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isActive: schedule.isActive,
      course: schedule.course
        ? {
            id: schedule.course.id,
            name: schedule.course.name,
            code: schedule.course.code,
          }
        : null,
      classroom: schedule.classroom
        ? {
            id: schedule.classroom.id,
            name: schedule.classroom.name,
            code: schedule.classroom.code,
          }
        : null,
      class: schedule.class
        ? {
            id: schedule.class.id,
            name: schedule.class.name,
          }
        : null,
    }));

    return {
      schedules: formattedSchedules,
      total,
    };
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

async getStudentsForTeacherByCourse(
  teacherId: string,
  courseId: string,
  page: number,
  limit: number,
  search?: string,
): Promise<{ students: any[]; total: number }> {
  console.log(`Fetching students for teacher ID: ${teacherId}, course ID: ${courseId}`);

  if (!isUUID(teacherId) || !isUUID(courseId)) {
    console.error('Invalid teacher ID or course ID:', teacherId, courseId);
    throw new NotFoundException('Invalid teacher ID or course ID');
  }

  const teacher = await this.teacherRepository.findOne({
    where: { id: teacherId },
    relations: ['user'],
  });

  if (!teacher) {
    console.error(`Teacher with ID ${teacherId} not found`);
    throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
  }

  const course = await this.courseRepository.findOne({
    where: { id: courseId, teacher: { id: teacherId } },
    relations: ['enrollments', 'enrollments.student', 'enrollments.student.user', 'enrollments.student.class'],
  });

  if (!course) {
    console.error(`Course with ID ${courseId} not found or not assigned to teacher ${teacherId}`);
    throw new NotFoundException(`Course with ID ${courseId} not found`);
  }

  let students = course.enrollments?.map((enrollment) => ({
    id: enrollment.student.id,
    firstName: enrollment.student.firstName,
    lastName: enrollment.student.lastName,
    email: enrollment.student.user?.email || null,
    class: enrollment.student.class
      ? {
          id: enrollment.student.class.id,
          name: enrollment.student.class.name,
        }
      : null,
    enrollmentDate: enrollment.enrollmentDate || enrollment.createdAt,
  })) || [];

  if (search) {
    const searchLower = search.toLowerCase();
    students = students.filter(
      (student) =>
        student.firstName.toLowerCase().includes(searchLower) ||
        student.lastName.toLowerCase().includes(searchLower) ||
        student.email?.toLowerCase().includes(searchLower) ||
        student.class?.name.toLowerCase().includes(searchLower),
    );
  }

  const total = students.length;
  const skip = (page - 1) * limit;
  const paginatedStudents = students.slice(skip, skip + limit);

  console.log(`Returning ${paginatedStudents.length} students for course ${courseId}, total: ${total}`);
  return {
    students: paginatedStudents,
    total,
  };
}

  async getTotalStudentsCount(teacherId: string): Promise<number> {
    console.log(`Fetching total students count for teacher ID: ${teacherId}`);

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
      relations: ['enrollments', 'enrollments.student'],
    });

    console.log(`Found ${courses.length} courses for teacher ${teacherId}`);

    const studentIds = new Set<string>();
    courses.forEach((course) => {
      console.log(
        `Processing course: ${course.name} (${course.id}) with ${course.enrollments?.length || 0} enrollments`,
      );

      if (course.enrollments && course.enrollments.length > 0) {
        course.enrollments.forEach((enrollment) => {
          if (enrollment.student) {
            studentIds.add(enrollment.student.id);
          }
        });
      }
    });

    console.log(
      `Total unique students for teacher ${teacherId}: ${studentIds.size}`,
    );
    return studentIds.size;
  }

  async getTotalCoursesCount(teacherId: string): Promise<number> {
    console.log(`Fetching total courses count for teacher ID: ${teacherId}`);

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

    const courseCount = await this.courseRepository.count({
      where: { teacher: { id: teacherId } },
    });

    console.log(`Total courses for teacher ${teacherId}: ${courseCount}`);
    return courseCount;
  }

  async getCoursesForTeacher(
    teacherId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ courses: any[]; total: number }> {
    console.log(`Fetching courses for teacher ID: ${teacherId}`);

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

    const skip = (page - 1) * limit;
    const where: any = { teacher: { id: teacherId } };

    if (search) {
      where.name = Like(`%${search}%`);
    }

    const [courses, total] = await this.courseRepository.findAndCount({
      where,
      relations: ['enrollments', 'class'],
      skip,
      take: limit,
    });

    console.log(`Found ${courses.length} courses, total: ${total}`);

    const formattedCourses = courses.map((course) => ({
      id: course.id,
      name: course.name,
      code: course.code,
      description: course.description,
      totalStudents: course.enrollments?.length || 0,
      class: course.class
        ? {
            id: course.class.id,
            name: course.class.name,
          }
        : null,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    }));

    return {
      courses: formattedCourses,
      total,
    };
  }

  async getClassesForTeacher(teacherId: string): Promise<any[]> {
    console.log(`Fetching classes for teacher ID: ${teacherId}`);

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
      relations: ['class'],
    });

    console.log(`Found ${courses.length} courses for teacher ${teacherId}`);

    const classMap = new Map<string, any>();
    courses.forEach((course) => {
      if (course.class && !classMap.has(course.class.id)) {
        classMap.set(course.class.id, {
          id: course.class.id,
          name: course.class.name,
          numericalName: course.class.numericalName,
          description: course.class.description,
        });
      }
    });

    const classes = Array.from(classMap.values());
    console.log(`Returning ${classes.length} classes for teacher ${teacherId}`);
    return classes;
  }

  async getCoursesForTeacherByClass(
    teacherId: string,
    classId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ courses: any[]; total: number }> {
    console.log(`Fetching courses for teacher ID: ${teacherId}, class ID: ${classId}`);

    if (!isUUID(teacherId) || !isUUID(classId)) {
      console.error('Invalid teacher ID or class ID:', teacherId, classId);
      throw new NotFoundException('Invalid teacher ID or class ID');
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

    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
    });

    if (!classEntity) {
      console.error(`Class with ID ${classId} not found`);
      throw new NotFoundException(`Class with ID ${classId} not found`);
    }

    console.log(`Class found: ${classEntity.name}`);

    const skip = (page - 1) * limit;
    const where: any = {
      teacher: { id: teacherId },
      class: { id: classId },
    };

    if (search) {
      where.name = Like(`%${search}%`);
    }

    const [courses, total] = await this.courseRepository.findAndCount({
      where,
      relations: ['enrollments', 'class'],
      skip,
      take: limit,
    });

    console.log(`Found ${courses.length} courses for class ${classId}, total: ${total}`);

    const formattedCourses = courses.map((course) => ({
      id: course.id,
      name: course.name,
      code: course.code,
      description: course.description,
      totalStudents: course.enrollments?.length || 0,
      class: course.class
        ? {
            id: course.class.id,
            name: course.class.name,
          }
        : null,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    }));

    return {
      courses: formattedCourses,
      total,
    };
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