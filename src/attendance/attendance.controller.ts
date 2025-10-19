import { Controller, Post, Body, Request, UseGuards, ValidationPipe, Get, Param } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto, AttendanceResponseDto } from './dtos/attendance.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('teacher/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createAttendance(
    @Body(new ValidationPipe({ transform: true })) createAttendanceDto: CreateAttendanceDto,
    @Request() req,
  ): Promise<AttendanceResponseDto[]> {
    // Log req.user for debugging
    console.log('JWT user:', req.user);

    const attendances = await this.attendanceService.createAttendance(
      createAttendanceDto,
      req.user.sub, // Use sub from JWT payload
    );

    return attendances.map((attendance) => ({
      id: attendance.id,
      student: {
        id: attendance.student.id,
        firstName: attendance.student.student?.firstName || '',
        lastName: attendance.student.student?.lastName || '',
      },
      teacher: {
        id: attendance.teacher.id,
        firstName: attendance.teacher.teacher?.firstName || '',
        lastName: attendance.teacher.teacher?.lastName || '',
      },
      course: {
        id: attendance.course.id,
        name: attendance.course.name,
      },
      class: {
        id: attendance.class.id,
        name: attendance.class.name,
      },
      isPresent: attendance.isPresent,
      date: attendance.date.toISOString(),
    }));
  }
}

// Separate controller for student attendance endpoints
@Controller('attendance/student')
@UseGuards(JwtAuthGuard)
export class StudentAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get(':studentId/rate')
  async getStudentAttendanceRate(
    @Param('studentId') studentId: string,
    @Request() req,
  ) {
    try {
      // Support 'me' alias for current user
      if (studentId === 'me') {
        console.log('Attendance request for current user, userId:', req.user?.sub);
        // Use the user ID directly since attendance references User entity
        return this.attendanceService.getStudentAttendanceRate(req.user.sub, req.user.sub);
      }
      console.log('Attendance request for student ID:', studentId);
      return this.attendanceService.getStudentAttendanceRate(studentId, req.user.sub);
    } catch (error) {
      console.error('Attendance rate error:', error);
      throw error;
    }
  }
}