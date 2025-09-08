import { Controller, Get, Post, Body, Query, UsePipes, ValidationPipe, Param, Request, UseGuards } from '@nestjs/common';
import { ExamService } from './exam.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { Exam } from './entities/exam.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Role } from 'src/user/enums/role.enum';

@Controller('exams')
export class ExamController {
  constructor(
    private readonly examService: ExamService,
    private readonly systemLoggingService: SystemLoggingService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Request() req,
    @Query('searchText') searchText?: string,
    @Query('class') className?: string,
    @Query('teacherId') teacherId?: string,
    @Query('teacherName') teacherName?: string,
    @Query('Term') Term?: string,
    @Query('schoolId') schoolIdOverride?: string,
  ): Promise<Exam[]> {
    const isSuper = req.user?.role === Role.SUPER_ADMIN;
    const schoolScope = isSuper ? (schoolIdOverride || req.user?.schoolId) : req.user?.schoolId;
    
    // Enhanced diagnostic logging
    await this.systemLoggingService.logAction({
      action: 'EXAMS_LIST_REQUEST',
      module: 'EXAMS',
      level: 'debug',
      schoolId: schoolScope,
      performedBy: req?.user ? { 
        id: req.user.sub || req.user.id, 
        role: req.user.role, 
        email: req.user.email
      } : undefined,
      metadata: { 
        searchText, 
        className, 
        teacherId, 
        teacherName, 
        Term, 
        schoolIdOverride,
        derivedSchoolScope: schoolScope,
        isSuper,
        hasUser: !!req.user,
        userSchoolId: req.user?.schoolId
      }
    });
    
    const results = await this.examService.findByFilters(searchText, className, teacherId, teacherName, Term, schoolScope, isSuper);
    
    // Log results
    await this.systemLoggingService.logAction({
      action: 'EXAMS_LIST_RESPONSE',
      module: 'EXAMS', 
      level: 'debug',
      schoolId: schoolScope,
      metadata: { 
        resultCount: results.length,
        examIds: results.map(e => e.id),
        schoolScope,
        isSuper
      }
    });
    
    return results;
  }

  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  async getStatistics(@Request() req, @Query('schoolId') schoolIdOverride?: string) {
    const isSuper = req.user?.role === Role.SUPER_ADMIN;
    const schoolScope = isSuper ? (schoolIdOverride || req.user?.schoolId) : req.user?.schoolId;
    const stats = await this.examService.getExamStatistics(schoolScope, isSuper);
    await this.systemLoggingService.logAction({
      action: 'EXAMS_STATS_QUERIED',
      module: 'EXAMS',
      level: 'debug',
      schoolId: schoolScope,
      performedBy: req?.user ? { id: req.user.sub || req.user.id, role: req.user.role, email: req.user.email } : undefined,
      metadata: stats
    });
    return stats;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Request() req, @Body() createExamDto: CreateExamDto, @Query('schoolId') schoolIdOverride?: string): Promise<Exam> {
    const isSuper = req.user?.role === Role.SUPER_ADMIN;
    const schoolScope = isSuper ? (schoolIdOverride || req.user?.schoolId) : req.user?.schoolId;
    const created = await this.examService.create(createExamDto, schoolScope, isSuper);
    await this.systemLoggingService.logAction({
      action: 'EXAM_CREATED',
      module: 'EXAMS',
      level: 'info',
      entityId: created.id,
      entityType: 'Exam',
  newValues: { id: created.id, title: created.title, courseId: created.course?.id, classId: created.class?.id, date: created.date, status: created.status },
      metadata: { description: 'Exam created', schoolId: created.schoolId }
    });
    return created;
  }


  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Request() req, @Param('id') id: string, @Query('schoolId') schoolIdOverride?: string): Promise<Exam> {
    const isSuper = req.user?.role === Role.SUPER_ADMIN;
    const schoolScope = isSuper ? (schoolIdOverride || req.user?.schoolId) : req.user?.schoolId;
    return this.examService.findOne(id, schoolScope, isSuper);
  }

  @Get('debug/data')
  @UseGuards(JwtAuthGuard)
  async debugExamData(@Request() req, @Query('schoolId') schoolIdOverride?: string) {
    const isSuper = req.user?.role === Role.SUPER_ADMIN;
    const schoolScope = isSuper ? (schoolIdOverride || req.user?.schoolId) : req.user?.schoolId;
    const debugData = await this.examService.debugExamData(schoolScope, isSuper);
    await this.systemLoggingService.logAction({
      action: 'EXAMS_DEBUG_DATA_ACCESSED',
      module: 'EXAMS',
      level: 'info',
      schoolId: schoolScope,
      performedBy: req?.user ? { id: req.user.sub || req.user.id, role: req.user.role, email: req.user.email } : undefined,
      metadata: { examCount: debugData.examCount, schoolScope, isSuper }
    });
    return debugData;
  }
}