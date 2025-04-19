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
    // NotFoundException,
    ForbiddenException,
  } from '@nestjs/common';
  import { ExamService } from './exam.service';
  import { CreateExamDto } from './dto/create-exam.dto';
  import { UpdateExamDto } from './dto/update-exam.dto';
  import { AuthGuard } from '@nestjs/passport';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../common/decorators/roles.decorator';
  import { Role } from '../user/enums/role.enum';
  
  @Controller('exams')
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
          throw new ForbiddenException(
            'You are not assigned to this course',
          );
        }
      }
  
      return this.examService.create(createExamDto, req.user.teacher?.id);
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
          throw new ForbiddenException(
            'You are not assigned to this course',
          );
        }
      }
  
      return this.examService.findAllByCourse(courseId);
    }
  
    @Get(':id')
    @Roles(Role.ADMIN, Role.TEACHER)
    async findOne(@Param('id') id: string, @Request() req) {
      const exam = await this.examService.findOne(id);
      
      if (req.user.role === Role.TEACHER && exam.teacherId !== req.user.teacher.id) {
        throw new ForbiddenException(
          'You are not authorized to access this exam',
        );
      }
      
      return exam;
    }
  
    @Put(':id')
    @Roles(Role.ADMIN, Role.TEACHER)
    async update(
      @Param('id') id: string,
      @Body() updateExamDto: UpdateExamDto,
      @Request() req,
    ) {
      const exam = await this.examService.findOne(id);
      
      if (req.user.role === Role.TEACHER && exam.teacherId !== req.user.teacher.id) {
        throw new ForbiddenException(
          'You are not authorized to update this exam',
        );
      }
  
      return this.examService.update(id, updateExamDto);
    }
  
    @Delete(':id')
    @Roles(Role.ADMIN, Role.TEACHER)
    async remove(@Param('id') id: string, @Request() req) {
      const exam = await this.examService.findOne(id);
      
      if (req.user.role === Role.TEACHER && exam.teacherId !== req.user.teacher.id) {
        throw new ForbiddenException(
          'You are not authorized to delete this exam',
        );
      }
  
      return this.examService.remove(id);
    }
  
    @Get('teacher/my-exams')
    @Roles(Role.TEACHER)
    async findTeacherExams(@Request() req) {
      return this.examService.findExamsByTeacher(req.user.teacher.id);
    }
  }