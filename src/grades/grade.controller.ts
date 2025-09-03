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
  async getAllClasses() {
    return this.gradeService.getAllClasses();
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
    @Query('Term') Term?: string,
    @Query('period') period?: string
  ) {
    return this.gradeService.getClassGrades(
      classId, 
      req.user.sub, 
      req.user.schoolId, // Pass the user's schoolId
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
}