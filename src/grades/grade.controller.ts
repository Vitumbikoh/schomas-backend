import { Controller, Post, Body, Request, UseGuards, UsePipes, ValidationPipe, Get } from '@nestjs/common';
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
  @Get('students')
  async getGrades(@Request() req) {
    return this.gradeService.getStudentGrades(req.user.sub);
  }
}