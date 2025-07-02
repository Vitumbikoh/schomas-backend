import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ExamService } from './exam.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { Exam } from './entities/exam.entity';

@Controller('exams')
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Get()
  async findAll(
    @Query('searchTerm') searchTerm?: string,
    @Query('class') className?: string,
    @Query('teacher') teacher?: string,
    @Query('academicYear') academicYear?: string,
  ): Promise<Exam[]> {
    return this.examService.findByFilters(searchTerm, className, teacher, academicYear);
  }

  @Post()
  async create(@Body() createExamDto: CreateExamDto): Promise<Exam> {
    return this.examService.create(createExamDto);
  }
}