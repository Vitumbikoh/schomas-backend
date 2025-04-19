// src/exam/exam.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ExamService } from './exam.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';

@Controller('exams') // Updated to match your API structure
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Post()
  @Roles(Role.ADMIN, Role.TEACHER)
  async create(@Body() createExamDto: CreateExamDto, @Request() req) {
    if (req.user.role === Role.TEACHER) {
      const isAssigned = await this.examService.isTeacherAssignedToCourse(
        req.user.teacher.id,
        createExamDto.courseId,
      );
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to this course');
      }
    }

    const exam = await this.examService.create(
      createExamDto,
      req.user.teacher?.id,
    );
    return {
      success: true,
      data: exam,
      message: 'Exam created successfully',
    };
  }

  @Get('course/:courseId')
  @Roles(Role.ADMIN, Role.TEACHER)
  async findAllByCourse(@Param('courseId') courseId: string, @Request() req) {
    if (req.user.role === Role.TEACHER) {
      const isAssigned = await this.examService.isTeacherAssignedToCourse(
        req.user.teacher.id,
        courseId,
      );
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to this course');
      }
    }

    const exams = await this.examService.findAllByCourse(courseId);
    return {
      success: true,
      data: exams,
      message: 'Exams retrieved successfully',
    };
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.TEACHER)
  async getDashboardData(@Request() req) {
    try {
      let data;
      if (req.user.role === Role.ADMIN) {
        data = await this.examService.getAdminDashboardData();
      } else {
        if (!req.user.teacher?.id) {
          throw new ForbiddenException('Teacher information not found');
        }
        data = await this.examService.getTeacherDashboardData(
          req.user.teacher.id,
        );
      }

      return {
        success: true,
        data: {
          ...data,
          stats: {
            ...data.stats,
            // Calculate additional stats if needed
            gradedSubmissions: data.recentGrades.length,
            pendingGrading: 0, // You'll need to implement this
            averageScore:
              data.recentGrades.length > 0
                ? data.recentGrades.reduce(
                    (sum, grade) => sum + grade.percentage,
                    0,
                  ) / data.recentGrades.length
                : 0,
          },
        },
        message: 'Dashboard data retrieved successfully',
      };
    } catch (error) {
      console.error('Error in getDashboardData:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch dashboard data',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  async findOne(@Param('id') id: string, @Request() req) {
    const exam = await this.examService.findOne(id);

    if (
      req.user.role === Role.TEACHER &&
      exam.teacherId !== req.user.teacher.id
    ) {
      throw new ForbiddenException(
        'You are not authorized to access this exam',
      );
    }

    return {
      success: true,
      data: exam,
      message: 'Exam retrieved successfully',
    };
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  async update(
    @Param('id') id: string,
    @Body() updateExamDto: UpdateExamDto,
    @Request() req,
  ) {
    const exam = await this.examService.findOne(id);

    if (
      req.user.role === Role.TEACHER &&
      exam.teacherId !== req.user.teacher.id
    ) {
      throw new ForbiddenException(
        'You are not authorized to update this exam',
      );
    }

    const updatedExam = await this.examService.update(id, updateExamDto);
    return {
      success: true,
      data: updatedExam,
      message: 'Exam updated successfully',
    };
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  async remove(@Param('id') id: string, @Request() req) {
    const exam = await this.examService.findOne(id);

    if (
      req.user.role === Role.TEACHER &&
      exam.teacherId !== req.user.teacher.id
    ) {
      throw new ForbiddenException(
        'You are not authorized to delete this exam',
      );
    }

    await this.examService.remove(id);
    return {
      success: true,
      message: 'Exam deleted successfully',
    };
  }

  @Get('teacher/my-exams')
  @Roles(Role.TEACHER)
  async findTeacherExams(@Request() req) {
    const exams = await this.examService.findExamsByTeacher(
      req.user.teacher.id,
    );
    return {
      success: true,
      data: exams,
      message: 'Teacher exams retrieved successfully',
    };
  }
}
