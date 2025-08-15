import { Controller, Get, Post, Body, Query, UsePipes, ValidationPipe, Param } from '@nestjs/common';
import { ExamService } from './exam.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { Exam } from './entities/exam.entity';

@Controller('exams')
export class ExamController {
  constructor(
    private readonly examService: ExamService,
    private readonly systemLoggingService: SystemLoggingService,
  ) {}

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
    const created = await this.examService.create(createExamDto);
    await this.systemLoggingService.logAction({
      action: 'EXAM_CREATED',
      module: 'EXAMS',
      level: 'info',
      entityId: created.id,
      entityType: 'Exam',
      newValues: { id: created.id, title: created.title, courseId: created.course?.id, classId: created.class?.id, date: created.date, status: created.status },
      metadata: { description: 'Exam created' }
    });
    return created;
  }


  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Exam> {
    return this.examService.findOne(id);
  }
}