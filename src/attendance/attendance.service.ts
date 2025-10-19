import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from './entity/attendance.entity';
import { CreateAttendanceDto } from './dtos/attendance.dto';
import { User } from 'src/user/entities/user.entity';
import { Course } from 'src/course/entities/course.entity';
import { Class } from 'src/classes/entity/class.entity';
import { Role } from 'src/user/enums/role.enum';
import { Student } from 'src/user/entities/student.entity';
import { Teacher } from 'src/user/entities/teacher.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
  ) {}

  async createAttendance(
    createAttendanceDto: CreateAttendanceDto,
    userId: string,
  ): Promise<Attendance[]> {
    const { classId, courseId, scheduleId, schoolId, date, attendanceStatus } = createAttendanceDto;

    // Validate attendanceStatus length
    if (Object.keys(attendanceStatus).length === 0) {
      throw new BadRequestException('No attendance data provided');
    }

    // Fetch user with TEACHER role
    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.TEACHER },
    });
    if (!user) {
      console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
      throw new UnauthorizedException('User is not a teacher or does not exist');
    }

    // Validate schoolId if provided
    if (schoolId && user.schoolId !== schoolId) {
      throw new BadRequestException('Invalid school ID for this user');
    }

    const effectiveSchoolId = schoolId || user.schoolId;
    if (!effectiveSchoolId) {
      throw new BadRequestException('School ID is required');
    }

    // Fetch teacher by userId
    const teacher = await this.teacherRepository.findOne({
      where: { userId: userId },
    });
    if (!teacher) {
      console.log(`No Teacher found for userId: ${userId}`);
      throw new UnauthorizedException('No Teacher profile associated with this user');
    }
    console.log(`Found teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.id})`);

    // Fetch class
    const classEntity = await this.classRepository.findOne({ 
      where: { id: classId, schoolId: effectiveSchoolId } 
    });
    if (!classEntity) {
      throw new BadRequestException('Invalid class');
    }

    // Fetch course and verify teacher association using Teacher ID
    const course = await this.courseRepository.findOne({
      where: { id: courseId, teacher: { id: teacher.id }, schoolId: effectiveSchoolId },
      relations: ['teacher'],
    });
    if (!course) {
      console.log(`Course ${courseId} not found or not assigned to teacher ${teacher.id}`);
      throw new BadRequestException('Invalid course or teacher not assigned');
    }

    // Create attendance records
    const attendanceRecords: Attendance[] = [];
    for (const [studentId, isPresent] of Object.entries(attendanceStatus)) {
      // Fetch Student entity directly
      const student = await this.studentRepository.findOne({
        where: { id: studentId, schoolId: effectiveSchoolId },
      });
      if (!student) {
        console.log(`No Student entity found for id: ${studentId}`);
        throw new BadRequestException(`Invalid student ID: ${studentId}`);
      }

      // Fetch User entity using Student.userId
      const studentUser = await this.userRepository.findOne({
        where: { id: student.userId, role: Role.STUDENT },
      });
      if (!studentUser) {
        console.log(`No User found for student userId: ${student.userId} with role: ${Role.STUDENT}`);
        throw new BadRequestException(`Invalid student ID: ${studentId}`);
      }

      console.log(`Found student: ${student.firstName} ${student.lastName} (${student.id})`);

      const attendance = new Attendance();
      attendance.student = studentUser; // Use User entity for schema consistency
      attendance.teacher = user; // Use User entity for teacher
      attendance.course = course;
      attendance.class = classEntity;
      if (scheduleId) {
        attendance.scheduleId = scheduleId;
      }
      attendance.isPresent = isPresent;
      attendance.date = new Date(date);

      attendanceRecords.push(attendance);
    }

    // Save to database
    return this.attendanceRepository.save(attendanceRecords);
  }

  /**
   * Get student attendance rate
   * Returns the percentage of classes attended
   */
  async getStudentAttendanceRate(userId: string, requestUserId: string) {
    console.log('Getting attendance rate for userId:', userId);
    
    // First, verify the user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      console.log('User not found for ID:', userId);
      throw new BadRequestException('User not found');
    }

    console.log('User found, role:', user.role);

    // Check if user has student role
    if (user.role !== Role.STUDENT) {
      throw new BadRequestException('User is not a student');
    }

    // Find the student record for this user
    const student = await this.studentRepository.findOne({
      where: { userId: userId },
    });

    if (!student) {
      console.log('Student record not found for userId:', userId);
      throw new BadRequestException('Student record not found for this user');
    }

    console.log('Student record found, ID:', student.id);

    // Query all attendance records for this user (attendance references User entity directly)
    const allAttendance = await this.attendanceRepository.find({
      where: { student: { id: userId } },
    });

    console.log('Found attendance records:', allAttendance.length);

    // Always return a valid response, even with no attendance records
    const presentDays = allAttendance.filter(a => a.isPresent).length;
    const totalDays = allAttendance.length;
    const absentDays = totalDays - presentDays;
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

    return {
      attendanceRate: Math.round(attendanceRate * 10) / 10,
      totalDays,
      presentDays,
      absentDays,
    };
  }
}