import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { EnrollmentService } from './enrollment.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { SystemLoggingService } from 'src/logs/system-logging.service';

@ApiTags('Enrollments')
@ApiBearerAuth()
@Controller('enrollments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class EnrollmentController {
  constructor(
  private readonly enrollmentService: EnrollmentService,
  private readonly systemLoggingService: SystemLoggingService,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all enrollments' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of enrollments retrieved successfully',
  })
  async getAllEnrollments(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search = '',
    @Request() req,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const { enrollments, total } = await this.enrollmentService.getAllEnrollments(
      Number(page),
      Number(limit),
      search,
      req.user?.schoolId,
      isSuper,
    );

    const transformedEnrollments = enrollments.map((enrollment) => ({
      id: enrollment.id,
      studentName: enrollment.student
        ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
        : 'Unknown',
      courseName: enrollment.course ? enrollment.course.name : 'Unknown',
      enrollmentDate: enrollment.createdAt.toISOString(),
      status: enrollment.status,
    }));

    return {
      enrollments: transformedEnrollments,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    };
  }

  @Get('recent')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get recent enrollments' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of recent enrollments retrieved successfully',
  })
  async getRecentEnrollments(@Query('limit') limit = 5) {
  // For now require request user to scope; could be refactored to a guard
  const enrollments = await this.enrollmentService.findRecent(Number(limit));
    return enrollments.map((enrollment) => ({
      id: enrollment.id,
      studentName: enrollment.student
        ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
        : 'Unknown',
      courseName: enrollment.course ? enrollment.course.name : 'Unknown',
      enrollmentDate: enrollment.createdAt.toISOString(),
      status: enrollment.status,
    }));
  }

  @Post(':courseId/enroll/:studentId')
  @Roles(Role.ADMIN)
  async enrollStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @Request() req, // ✅ to get user & IP
  ) {
    if (!isUUID(courseId))
      throw new NotFoundException('Invalid course ID format');
    if (!isUUID(studentId))
      throw new NotFoundException('Invalid student ID format');

    try {
      const enrollment = await this.enrollmentService.enrollStudent(
        courseId,
        studentId,
        req.user?.schoolId,
        req.user?.role === 'SUPER_ADMIN',
      );

      // ✅ Create log
      await this.systemLoggingService.logAction({
        action: 'STUDENT_ENROLLED_CONTROLLER',
        module: 'ENROLLMENT',
        level: 'info',
  performedBy: { id: req.user.sub || req.user.id, email: req.user.email, role: req.user.role },
        entityId: enrollment.id,
        entityType: 'Enrollment',
        newValues: { studentId: enrollment.student.id, courseId: enrollment.course.id },
        metadata: { description: 'Student enrolled via controller' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return {
        success: true,
        enrollment: {
          id: enrollment.id,
          studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
          courseName: enrollment.course.name,
          enrollmentDate: enrollment.createdAt.toISOString(),
          status: enrollment.status,
        },
        message: 'Student enrolled successfully',
      };
    } catch (error) {
      throw new NotFoundException('Failed to enroll student: ' + error.message);
    }
  }

  @Get(':courseId/eligible-students')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List students eligible for enrollment in a course' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEligibleStudents(
    @Param('courseId') courseId: string,
    @Query('search') search: string,
    @Query('limit') limit = 50,
    @Request() req,
  ) {
    if (!isUUID(courseId)) throw new NotFoundException('Invalid course ID format');
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const students = await this.enrollmentService.getEligibleStudents(
      courseId,
      req.user?.schoolId,
      isSuper,
      search,
      Number(limit) || 50,
    );
    return {
      success: true,
      count: students.length,
      students: students.map(s => ({
        id: s.id,
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.user?.email,
        classId: s.classId,
      })),
    };
  }

  @Delete(':courseId/enroll/:studentId')
  @Roles(Role.ADMIN)
  async unenrollStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @Request() req,
  ) {
    if (!isUUID(courseId))
      throw new NotFoundException('Invalid course ID format');
    if (!isUUID(studentId))
      throw new NotFoundException('Invalid student ID format');

    try {
      await this.enrollmentService.unenrollStudent(
        courseId,
        studentId,
        req.user?.schoolId,
        req.user?.role === 'SUPER_ADMIN',
      );

      await this.systemLoggingService.logAction({
        action: 'STUDENT_UNENROLLED_CONTROLLER',
        module: 'ENROLLMENT',
        level: 'warn',
  performedBy: { id: req.user.sub || req.user.id, email: req.user.email, role: req.user.role },
        entityType: 'Enrollment',
        oldValues: { studentId, courseId },
        metadata: { description: 'Student unenrolled via controller' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return { success: true, message: 'Student unenrolled successfully' };
    } catch (error) {
      throw new NotFoundException(
        'Failed to unenroll student: ' + error.message,
      );
    }
  }

  // Alternative RESTful style: /course/:courseId/enrollments/:enrollmentId
  // This controller lives at /enrollments so full path becomes /enrollments/course/:courseId/enrollments/:enrollmentId
  // To match the path you attempted (/course/:courseId/enrollments/:enrollmentId) we add a global route below without the leading segment.
  @Delete('course/:courseId/enrollments/:enrollmentId')
  @Roles(Role.ADMIN)
  async deleteEnrollmentById(
    @Param('courseId') courseId: string,
    @Param('enrollmentId') enrollmentId: string,
    @Request() req,
  ) {
    if (!isUUID(courseId)) throw new NotFoundException('Invalid course ID format');
    if (!isUUID(enrollmentId)) throw new NotFoundException('Invalid enrollment ID format');
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    // Load enrollment to extract studentId
    // Reuse service repository via findAll query (could add dedicated method)
    // For efficiency, lightweight query:
    const enrollment = await (this as any).enrollmentService['enrollmentRepository'].findOne({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    await this.enrollmentService.unenrollStudent(courseId, enrollment.studentId, req.user?.schoolId, isSuper);
    await this.systemLoggingService.logAction({
      action: 'STUDENT_UNENROLLED_CONTROLLER',
      module: 'ENROLLMENT',
      level: 'warn',
      performedBy: { id: req.user.sub || req.user.id, email: req.user.email, role: req.user.role },
      entityType: 'Enrollment',
      entityId: enrollmentId,
      oldValues: { enrollmentId, courseId, studentId: enrollment.studentId },
      metadata: { description: 'Enrollment removed via alternative route' },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    return { success: true, message: 'Enrollment removed successfully' };
  }
}
