import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Param,
  Query,
} from '@nestjs/common';
import { GradeService } from './grade.service';
import { CreateGradeDto } from './dtos/grade.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('grades')
export class GradeController {
  constructor(private readonly gradeService: GradeService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UsePipes(new ValidationPipe())
  async createGrades(@Body() createGradeDto: CreateGradeDto, @Request() req) {
    return this.gradeService.createGrades(createGradeDto, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('classes')
  async getAllClasses() {
    return this.gradeService.getAllClasses();
  }

  @UseGuards(JwtAuthGuard)
  @Get('classes/:classId/students')
  async getClassStudents(
    @Param('classId') classId: string,
    @Request() req,
    @Query('academicYear') academicYear?: string,
    @Query('term') term?: string
  ) {
    return this.gradeService.getClassStudents(classId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('class/:classId')
  async getClassGrades(
    @Param('classId') classId: string,
    @Request() req,
    @Query('academicYear') academicYear?: string,
    @Query('term') term?: string
  ) {
    return this.gradeService.getClassGrades(classId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('students/:studentId')
  async getStudentGrades(
    @Param('studentId') studentId: string,
    @Request() req,
    @Query('classId') classId?: string,
    @Query('academicYear') academicYear?: string,
    @Query('term') term?: string
  ) {
    return this.gradeService.getStudentGrades(studentId, req.user.sub);
  }
}