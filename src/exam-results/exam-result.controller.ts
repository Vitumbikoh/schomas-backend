import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
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
    // Support 'me' alias so students don't need to know their internal student UUID
    let resolvedStudentId = studentId;
    if (studentId === 'me') {
      // Try to resolve student entity by userId
      const userId = req.user?.userId || req.user?.sub || req.user?.id;
      const student = await this.examResultService['studentRepository'].findOne({ where: { userId } });
      if (!student) {
        // If the student record is not found, return a clear error
        throw new NotFoundException('Student record not found for the authenticated user');
      }
      resolvedStudentId = student.id;
    }

    return this.examResultService.getStudentResults(
      resolvedStudentId,
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

  @Get('debug/class/:classId')
  async debugClassResults(
    @Param('classId') classId: string,
    @Query('termId') termId?: string,
    @Request() req?: any,
  ) {
    return this.examResultService.debugClassResults(
      classId,
      req.user.userId,
      termId,
    );
  }
}