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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';

@ApiTags('Enrollments')
@ApiBearerAuth()
@Controller('enrollments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

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
  ) {
    const { enrollments, total } = await this.enrollmentService.getAllEnrollments(
      Number(page),
      Number(limit),
      search,
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
  @ApiOperation({ summary: 'Enroll a student in a course' })
  @ApiResponse({ status: 201, description: 'Student enrolled successfully' })
  async enrollStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
  ) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }
    if (!isUUID(studentId)) {
      throw new NotFoundException('Invalid student ID format');
    }

    try {
      const enrollment = await this.enrollmentService.enrollStudent(
        courseId,
        studentId,
      );
      return {
        success: true,
        enrollment: {
          id: enrollment.id,
          studentName: enrollment.student
            ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
            : 'Unknown',
          courseName: enrollment.course ? enrollment.course.name : 'Unknown',
          enrollmentDate: enrollment.createdAt.toISOString(),
          status: enrollment.status,
        },
        message: 'Student enrolled successfully',
      };
    } catch (error) {
      throw new NotFoundException('Failed to enroll student: ' + error.message);
    }
  }

  @Delete(':courseId/enroll/:studentId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Unenroll a student from a course' })
  @ApiResponse({ status: 200, description: 'Student unenrolled successfully' })
  async unenrollStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
  ) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }
    if (!isUUID(studentId)) {
      throw new NotFoundException('Invalid student ID format');
    }

    try {
      await this.enrollmentService.unenrollStudent(courseId, studentId);
      return {
        success: true,
        message: 'Student unenrolled successfully',
      };
    } catch (error) {
      throw new NotFoundException('Failed to unenroll student: ' + error.message);
    }
  }
}