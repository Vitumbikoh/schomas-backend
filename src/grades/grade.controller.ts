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
import { GradesReportQueryDto } from './dtos/grades-report-query.dto';
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
  async getAllClasses(@Request() req) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolId = isSuper ? (req.query?.schoolId as string) : req.user?.schoolId;
    return this.gradeService.getAllClasses(schoolId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('classes/:classId/students')
  async getClassStudents(
    @Param('classId') classId: string,
    @Request() req,
    @Query('Term') Term?: string,
    @Query('period') period?: string
  ) {
    return this.gradeService.getClassStudents(classId, req.user.sub, req.user.schoolId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('class/:classId')
  async getClassGrades(
    @Param('classId') classId: string,
    @Request() req,
    @Query('termId') termId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Query('Term') Term?: string,
    @Query('period') period?: string
  ) {
    return this.gradeService.getClassGrades(
      classId, 
      req.user.sub, 
      req.user.schoolId, // Pass the user's schoolId
      termId,
      academicCalendarId,
      Term, 
      period
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/:studentId')
  async getStudentGrades(
    @Param('studentId') studentId: string,
    @Request() req,
    @Query('classId') classId?: string,
    // legacy query params retained (Term/period) but new ones added for clarity
    @Query('termId') termId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Query('Term') Term?: string, // deprecated: year based filter
    @Query('period') period?: string
  ) {
    // Pass through filtering arguments so only grades belonging to the specified class/term/calendar are returned
    return this.gradeService.getStudentGrades(
      studentId,
      req.user.sub,
      classId,
      termId,
      academicCalendarId,
      Term,
      period,
    );
  }
//getting students
  @UseGuards(JwtAuthGuard)
@Get('students')
async getStudentOwnGrades(@Request() req) {
  return this.gradeService.getStudentOwnGrades(req.user.sub);
}

  // Flexible reporting endpoint
  @UseGuards(JwtAuthGuard)
  @Get('report')
  async getGradesReport(@Query() query: GradesReportQueryDto, @Request() req) {
    return this.gradeService.getGradesReport(query, req.user.sub, req.user.schoolId);
  }

  // Comprehensive filtered results endpoint
  @UseGuards(JwtAuthGuard)
  @Get('filtered')
  async getFilteredResults(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Query('termId') termId?: string,
    @Query('studentId') studentId?: string,
    @Query('examId') examId?: string,
    @Query('examType') examType?: string,
    @Query('search') search?: string,
    @Query('minGrade') minGrade?: number,
    @Query('maxGrade') maxGrade?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.gradeService.getFilteredResults(
      req.user.sub,
      req.user.schoolId,
      {
        classId,
        academicCalendarId,
        termId,
        studentId,
        examId,
        examType,
        search,
        minGrade,
        maxGrade,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      }
    );
  }
}