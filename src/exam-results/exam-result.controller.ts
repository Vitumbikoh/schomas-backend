import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExamResultService } from './exam-result.service';

@Controller('exam-results')
@UseGuards(JwtAuthGuard)
export class ExamResultController {
  constructor(private readonly examResultService: ExamResultService) {}

  @Get('student/:studentId')
  async getStudentResults(
    @Param('studentId') studentId: string,
    @Query('classId') classId?: string,
    @Query('termId') termId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Request() req?: any,
  ) {
    return this.examResultService.getStudentResults(
      studentId,
      req.user.userId,
      classId,
      termId,
      academicCalendarId,
    );
  }

  @Get('class/:classId')
  async getClassResults(
    @Param('classId') classId: string,
    @Query('schoolId') schoolId?: string,
    @Query('termId') termId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Request() req?: any,
  ) {
    return this.examResultService.getClassResults(
      classId,
      req.user.userId,
      schoolId,
      termId,
      academicCalendarId,
    );
  }
}