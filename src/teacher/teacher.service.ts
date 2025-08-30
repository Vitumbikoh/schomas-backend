import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Repository, Like, In } from 'typeorm';
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
import { Attendance } from 'src/attendance/entity/attendance.entity';
import { format } from 'date-fns';
import { SubmitGradesDto } from 'src/exams/dto/submit-grades.dto';
import { ExamService } from 'src/exams/exam.service';
import { Exam } from 'src/exams/entities/exam.entity';
import { Grade } from 'src/grades/entity/grade.entity';
import { Student } from 'src/user/entities/student.entity';
import { SettingsService } from 'src/settings/settings.service';

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
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    private readonly examService: ExamService,
    @InjectRepository(Exam)
    private readonly examRepository: Repository<Exam>,
    @InjectRepository(Grade)
    private readonly gradeRepository: Repository<Grade>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly settingsService: SettingsService,
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
      console.error(`Invalid user ID: ${userId}`);
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
    if (whereConditions && whereConditions.schoolId) {
      const schoolId = whereConditions.schoolId;
      const qb = this.teacherRepository
        .createQueryBuilder('teacher')
        .leftJoin('teacher.user', 'user')
        .where('(teacher.schoolId = :schoolId OR user.schoolId = :schoolId)', { schoolId });
      return qb.getCount();
    }
    return this.teacherRepository.count({ where: whereConditions, relations: ['user'] });
  }

  async countTeachersBySchool(schoolId: string): Promise<number> {
    if (!schoolId) return 0;
    return this.teacherRepository
      .createQueryBuilder('teacher')
      .leftJoin('teacher.user', 'user')
      .where('(teacher.schoolId = :schoolId OR user.schoolId = :schoolId)', { schoolId })
      .getCount();
  }

  async findAllPaginated(
    page: number,
    limit: number,
    search?: string,
    schoolId?: string,
    superAdmin = false,
  ): Promise<[Teacher[], number]> {
    const skip = (page - 1) * limit;
    const qb = this.teacherRepository
      .createQueryBuilder('teacher')
      .leftJoinAndSelect('teacher.user', 'user');

    if (!superAdmin) {
      if (!schoolId) return [[], 0];
      qb.where('(teacher.schoolId = :schoolId OR user.schoolId = :schoolId)', { schoolId });
    } else if (schoolId) {
      qb.where('(teacher.schoolId = :schoolId OR user.schoolId = :schoolId)', { schoolId });
    }

    if (search) {
      qb.andWhere(
        '(LOWER(teacher.firstName) LIKE :search OR LOWER(teacher.lastName) LIKE :search OR LOWER(user.email) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    const [teachers, total] = await qb.skip(skip).take(limit).getManyAndCount();

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
      console.error(`Invalid teacher ID: ${teacherId}`);
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

  async getUpcomingClassesForTeacher(
    teacherId: string,
    currentDate: Date,
  ): Promise<any[]> {
    console.log(`Fetching upcoming classes for teacher ID: ${teacherId}`);

    if (!isUUID(teacherId)) {
      console.error(`Invalid teacher ID: ${teacherId}`);
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

    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(currentDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Format current time for TIME comparison
    const currentTime = format(currentDate, 'HH:mm:ss');
    const currentDateStr = format(currentDate, 'yyyy-MM-dd');

    const schedules = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.course', 'course')
      .leftJoinAndSelect('schedule.classroom', 'classroom')
      .leftJoinAndSelect('schedule.class', 'class')
      .where('schedule.teacherId = :teacherId', { teacherId })
      .andWhere('schedule.isActive = :isActive', { isActive: true })
      .andWhere('schedule.date = :currentDateStr', { currentDateStr })
      .andWhere("TO_CHAR(schedule.startTime, 'HH24:MI:SS') > :currentTime", {
        currentTime,
      })
      .orderBy({
        'schedule.date': 'ASC',
        'schedule.startTime': 'ASC',
      })
      .take(3)
      .getMany();

    console.log(
      `Found ${schedules.length} upcoming classes for teacher ${teacherId}`,
    );

    return schedules.map((schedule) => ({
      id: schedule.id,
      courseName: schedule.course?.name || 'Unknown Course',
      className: schedule.class?.name || 'Unknown Class',
      room: schedule.classroom?.name || 'Unknown Room',
      startTime: format(schedule.startTime, 'HH:mm:ss'), // Format for display
    }));
  }

  async getAttendanceForTeacherToday(teacherId: string): Promise<any[]> {
    console.log(`Fetching today's attendance for teacher ID: ${teacherId}`);

    if (!isUUID(teacherId)) {
      console.error(`Invalid teacher ID: ${teacherId}`);
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const courses = await this.courseRepository.find({
      where: { teacher: { id: teacherId } },
      relations: ['enrollments', 'enrollments.student', 'class'],
    });

    const courseIds = courses.map((course) => course.id);
    const attendanceRecords = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.course', 'course')
      .leftJoinAndSelect('attendance.class', 'class')
      .where('attendance.courseId IN (:...courseIds)', { courseIds })
      .andWhere('attendance.date >= :today AND attendance.date < :tomorrow', {
        today,
        tomorrow,
      })
      .getMany();

    const attendanceMap = new Map<
      string,
      {
        className: string;
        courseName: string;
        enrolled: number;
        present: number;
      }
    >();

    courses.forEach((course) => {
      const className = course.class?.name || 'Unknown';
      const courseName = course.name;
      const key = `${className}-${courseName}`;
      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, {
          className,
          courseName,
          enrolled: course.enrollments?.length || 0,
          present: 0,
        });
      }
    });

    attendanceRecords.forEach((record) => {
      const className = record.class?.name || 'Unknown';
      const courseName = record.course?.name || 'None';
      const key = `${className}-${courseName}`;
      if (attendanceMap.has(key) && record.isPresent) {
        const attendanceRecord = attendanceMap.get(key);
        if (attendanceRecord) {
          attendanceRecord.present++;
        }
      }
    });

    const attendance = Array.from(attendanceMap.values()).slice(0, 3);
    console.log(
      `Returning ${attendance.length} attendance records for teacher ${teacherId}`,
    );

    return attendance.map((record) => ({
      className: record.className,
      courseName: record.courseName,
      enrolledStudents: record.enrolled,
      presentStudents: record.present,
    }));
  }

  async getStudentsForTeacher(teacherId: string) {
    console.log(`Fetching students for teacher ID: ${teacherId}`);

    if (!isUUID(teacherId)) {
      console.error(`Invalid teacher ID: ${teacherId}`);
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
    console.log(
      `Fetching students for teacher ID: ${teacherId}, course ID: ${courseId}`,
    );

    if (!isUUID(teacherId) || !isUUID(courseId)) {
      console.error(
        `Invalid teacher ID or course ID: ${teacherId}, ${courseId}`,
      );
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
      relations: [
        'enrollments',
        'enrollments.student',
        'enrollments.student.user',
        'enrollments.student.class',
      ],
    });

    if (!course) {
      console.error(
        `Course with ID ${courseId} not found or not assigned to teacher ${teacherId}`,
      );
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    let students =
      course.enrollments?.map((enrollment) => ({
        id: enrollment.student.id,
        studentId: enrollment.student.studentId, // Added this line
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
          student.class?.name.toLowerCase().includes(searchLower) ||
          student.studentId?.toString().includes(searchLower), // Added search by studentId
      );
    }

    const total = students.length;
    const skip = (page - 1) * limit;
    const paginatedStudents = students.slice(skip, skip + limit);

    console.log(
      `Returning ${paginatedStudents.length} students for course ${courseId}, total: ${total}`,
    );
    return {
      students: paginatedStudents,
      total,
    };
  }

  async getTotalStudentsCount(teacherId: string): Promise<number> {
    console.log(`Fetching total students count for teacher ID: ${teacherId}`);

    if (!isUUID(teacherId)) {
      console.error(`Invalid teacher ID: ${teacherId}`);
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

  async getTotalCoursesCount(teacherId: string, schoolId?: string, superAdmin = false): Promise<number> {
    console.log(`Fetching total courses count for teacher ID: ${teacherId}`);

    if (!isUUID(teacherId)) {
      console.error(`Invalid teacher ID: ${teacherId}`);
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
    
    // Validate school access
    if (!superAdmin && schoolId && teacher.schoolId !== schoolId) {
      throw new ForbiddenException('Access denied to teacher from different school');
    }

    console.log(`Teacher found: ${teacher.firstName} ${teacher.lastName}`);

    const whereCondition: any = { teacher: { id: teacherId } };
    
    // Add school filtering to courses for extra security
    if (!superAdmin) {
      if (schoolId) whereCondition.schoolId = schoolId;
    } else if (schoolId) {
      whereCondition.schoolId = schoolId;
    }

    const courseCount = await this.courseRepository.count({
      where: whereCondition,
    });

    console.log(`Total courses for teacher ${teacherId}: ${courseCount}`);
    return courseCount;
  }

  // src/teacher/teacher.service.ts
  async getCoursesForTeacher(
    teacherId: string,
    page: number,
    limit: number,
    search?: string,
    includeExams: boolean = false,
  ): Promise<{ courses: any[]; total: number }> {
    console.log(
      `Fetching courses for teacher ID: ${teacherId}, includeExams: ${includeExams}`,
    );

    if (!isUUID(teacherId)) {
      throw new NotFoundException('Invalid teacher ID');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
    }

    console.log(`Teacher found: ${teacher.firstName} ${teacher.lastName}`);

    const skip = (page - 1) * limit;
    const where: any = { teacher: { id: teacherId } };

    if (search) {
      where.name = Like(`%${search}%`);
    }

    const relations = ['enrollments', 'class'];
    if (includeExams) {
      relations.push('exams');
    }

    const [courses, total] = await this.courseRepository.findAndCount({
      where,
      relations,
      skip,
      take: limit,
    });

    console.log(`Found ${courses.length} courses, total: ${total}`);
    console.log(
      'Courses:',
      courses.map((c) => ({
        id: c.id,
        name: c.name,
        exams: includeExams ? (c.exams ? c.exams.length : 0) : 'not included',
        examIds: includeExams
          ? c.exams
            ? c.exams.map((e) => e.id)
            : []
          : 'not included',
      })),
    );

    // Get exam counts as a fallback
    let examCountMap = new Map<string, number>();
    if (includeExams) {
      const courseIds = courses.map((c) => c.id);
      console.log('Course IDs for exam count query:', courseIds);
  examCountMap = await this.examService.getExamCountByCourse(courseIds, teacher.schoolId, false);
      console.log('Exam count map:', Array.from(examCountMap.entries()));
    }

    const formattedCourses = courses.map((course) => {
      const examsCount = includeExams
        ? examCountMap.get(course.id) || course.exams?.length || 0
        : 0;
      return {
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
        exams: includeExams ? course.exams || [] : undefined,
        examsCount,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      };
    });

    console.log(`Total courses found: ${formattedCourses.length}`);
    return {
      courses: formattedCourses,
      total,
    };
  }

  async findByClass(classId: string): Promise<Teacher[]> {
    return this.teacherRepository
      .createQueryBuilder('teacher')
      .leftJoinAndSelect('teacher.user', 'user')
      .leftJoin('teacher.class', 'class')
      .where('class.id = :classId', { classId })
      .getMany();
  }

  async getClassesForTeacher(teacherId: string): Promise<any[]> {
    console.log(`Fetching classes for teacher ID: ${teacherId}`);

    if (!isUUID(teacherId)) {
      console.error(`Invalid teacher ID: ${teacherId}`);
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
    console.log(
      `Fetching courses for teacher ID: ${teacherId}, class ID: ${classId}`,
    );

    if (!isUUID(teacherId) || !isUUID(classId)) {
      console.error(`Invalid teacher ID or class ID: ${teacherId}, ${classId}`);
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

    console.log(
      `Found ${courses.length} courses for class ${classId}, total: ${total}`,
    );

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

  async create(createTeacherDto: CreateTeacherDto & { schoolId?: string }): Promise<Teacher> {
    const validatedDto = plainToClass(CreateTeacherDto, createTeacherDto);

    const hashedPassword = await bcrypt.hash(validatedDto.password, 10);
  // Auto-generate username if missing using scheme: first10 + last10 (+counter) + @teacher
    let username = validatedDto.username?.trim().toLowerCase();
    if (!username) {
      const norm = (s: string) => (s || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['`’]/g, '')
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      const f = norm(validatedDto.firstName).slice(0, 10);
      const l = norm(validatedDto.lastName).slice(0, 10);
      const base = (f + l) || 'teacher';
  const roleTag = '@teacher';
  let candidate = base + roleTag;
      let counter = 2;
      while (await this.userRepository.findOne({ where: { username: candidate } })) {
  candidate = `${base}${counter}${roleTag}`;
        counter++;
        if (counter > 9999) {
          candidate = base.slice(0, 12) + Date.now().toString(36) + roleTag;
          break;
        }
      }
      username = candidate;
    } else {
      // ensure uniqueness if provided
      const existing = await this.userRepository.findOne({ where: { username } });
      if (existing) {
        throw new Error('Username already exists');
      }
    }

    const user = this.userRepository.create({
      username,
      email: validatedDto.email,
      password: hashedPassword,
      role: Role.TEACHER,
      schoolId: createTeacherDto.schoolId || undefined,
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
      schoolId: createTeacherDto.schoolId || undefined,
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

  async getClassesWithCoursesForTeacher(teacherId: string): Promise<any[]> {
    const courses = await this.courseRepository.find({
      where: { teacher: { id: teacherId } },
      relations: ['class'],
    });

    const classMap = new Map<
      string,
      { id: string; name: string; courses: string[] }
    >();

    courses.forEach((course) => {
      if (course.class) {
        if (!classMap.has(course.class.id)) {
          classMap.set(course.class.id, {
            id: course.class.id,
            name: course.class.name,
            courses: [],
          });
        }
        classMap.get(course.class.id)?.courses.push(course.name);
      }
    });

    return Array.from(classMap.values());
  }

  async getStudentsForTeacherByClass(
    teacherId: string,
    classId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ students: any[]; total: number }> {
    const courses = await this.courseRepository.find({
      where: {
        teacher: { id: teacherId },
        class: { id: classId },
      },
      relations: [
        'enrollments',
        'enrollments.student',
        'enrollments.student.user',
        'enrollments.student.class',
      ],
    });

    const studentsMap = new Map<string, any>();

    courses.forEach((course) => {
      course.enrollments?.forEach((enrollment) => {
        const student = enrollment.student;
        if (student && !studentsMap.has(student.id)) {
          studentsMap.set(student.id, {
            id: student.id,
            name: `${student.firstName} ${student.lastName}`,
            class: student.class?.name || 'N/A',
          });
        }
      });
    });

    let students = Array.from(studentsMap.values());

    if (search) {
      const searchLower = search.toLowerCase();
      students = students.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          s.class.toLowerCase().includes(searchLower),
      );
    }

    const total = students.length;
    const skip = (page - 1) * limit;
    const paginatedStudents = students.slice(skip, skip + limit);

    return { students: paginatedStudents, total };
  }

  async verifyTeacherClassCourseAccess(
    teacherId: string,
    classId: string,
    courseName: string,
  ): Promise<boolean> {
    const count = await this.courseRepository.count({
      where: {
        teacher: { id: teacherId },
        class: { id: classId },
        name: courseName,
      },
    });
    return count > 0;
  }

  async getExamsForGrading(
    teacherId: string,
    courseId: string,
  ): Promise<any[]> {
    // First get the teacher to access their schoolId
    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      select: ['id', 'schoolId'],
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    console.log(`[DEBUG] getExamsForGrading - teacherId: ${teacherId}, courseId: ${courseId}, schoolId: ${teacher.schoolId}`);

    const exams = await this.examService.findByCourseAndTeacher(
      courseId,
      teacherId,
      teacher.schoolId, // Pass the teacher's schoolId
      false, // Not a super admin
    );

    console.log(`[DEBUG] Found ${exams.length} exams for grading`);
    console.log(`[DEBUG] Exam details:`, exams.map(e => ({ id: e.id, title: e.title, teacherId: e.teacher?.id, courseId: e.course?.id })));

    return exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      assessmentType: exam.examType,
      totalMarks: exam.totalMarks,
      date: exam.date,
      status: exam.status,
      examType: exam.examType,
      // Add other relevant fields
    }));
  }

async submitExamGrades(
  teacherId: string, // Change from userId to teacherId since we already verified in controller
  submitGradesDto: SubmitGradesDto,
): Promise<any> {
  // Get the teacher profile first to access their schoolId
  const teacher = await this.teacherRepository.findOne({
    where: { id: teacherId },
    select: ['id', 'schoolId'],
  });

  if (!teacher) {
    throw new NotFoundException('Teacher not found');
  }

  const exam = await this.examRepository.findOne({
    where: { 
      id: submitGradesDto.examId,
      schoolId: teacher.schoolId, // Add schoolId filtering
    },
    relations: ['course', 'teacher', 'class'],
  });

  if (!exam) {
    throw new NotFoundException('Exam not found');
  }

  // Verify the teacher is authorized for this exam
  if (exam.teacher.id !== teacher.id) {
    throw new ForbiddenException('You are not authorized to grade this exam');
  }

  // Get the current term
  const Term = await this.settingsService.getCurrentTerm();
  if (!Term) {
    throw new BadRequestException('No current term found. Please contact your administrator.');
  }

  // Rest of the method remains the same...
  const studentIds = Object.keys(submitGradesDto.grades);
  const students = await this.studentRepository.find({
    where: { studentId: In(studentIds) },
  });

  const gradeRecords: Grade[] = [];
  
  for (const [studentId, gradeValue] of Object.entries(submitGradesDto.grades)) {
    const student = students.find(s => s.studentId === studentId);
    if (!student) {
      console.warn(`Student with ID ${studentId} not found`);
      continue;
    }

    const grade = new Grade();
    grade.student = student;
    grade.teacher = teacher;
    grade.grade = gradeValue.toString();
    grade.assessmentType = exam.examType;
    grade.exam = exam;
    grade.course = exam.course;
    grade.class = exam.class;
    // Add multi-tenancy and term tracking
    grade.schoolId = teacher.schoolId;
    grade.termId = Term.id;
    gradeRecords.push(grade);
  }

  if (gradeRecords.length === 0) {
    throw new BadRequestException('No valid student IDs found');
  }

  await this.gradeRepository.save(gradeRecords);
  await this.examRepository.update(exam.id, { status: 'graded' });

  return {
    examId: exam.id,
    gradesSubmitted: gradeRecords.length,
    totalMarks: exam.totalMarks,
    invalidStudentIds: studentIds.filter(id => !students.some(s => s.studentId === id)),
  };
}
}
