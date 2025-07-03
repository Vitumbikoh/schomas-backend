import { Controller, Get, Post, Body, Query, UsePipes, ValidationPipe, Param } from '@nestjs/common';
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
    @Query('teacherId') teacherId?: string,
    @Query('teacherName') teacherName?: string,
    @Query('academicYear') academicYear?: string,
  ): Promise<Exam[]> {
    return this.examService.findByFilters(searchTerm, className, teacherId, teacherName, academicYear);
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() createExamDto: CreateExamDto): Promise<Exam> {
    return this.examService.create(createExamDto);
  }


  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Exam> {
    return this.examService.findOne(id);
  }
}