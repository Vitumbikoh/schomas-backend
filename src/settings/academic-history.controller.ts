import { Controller, Post, Param, Query, Request, UseGuards, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { AcademicHistoryService, TermHistoricalData, AcademicCalendarHistoricalData } from './services/academic-history.service';

export class CloseTermDto {
  reason?: string;
  preserveStudentData?: boolean = true;
  notifyStudents?: boolean = false;
}

export class CloseAcademicCalendarDto {
  reason?: string;
  preserveAllData?: boolean = true;
  autoPromoteStudents?: boolean = false;
  notifyStakeholders?: boolean = false;
}

@ApiTags('Academic History Management')
@ApiBearerAuth()
@Controller('academic-history')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AcademicHistoryController {
  constructor(
    private readonly academicHistoryService: AcademicHistoryService,
  ) {}

  @Post('close-term/:termId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({
    summary: 'Close a term and preserve all historical student data',
    description: 'Closes a term and automatically creates comprehensive historical records for all enrolled students including financial, academic, and personal data. This ensures data is preserved for reporting and analysis even after students move to new terms or graduate.'
  })
  @ApiParam({ name: 'termId', description: 'ID of the term to close' })
  @ApiQuery({ name: 'schoolId', required: false, description: 'School ID (for super admin)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Term closed successfully with historical data preserved',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            termId: { type: 'string' },
            academicCalendarId: { type: 'string' },
            totalStudents: { type: 'number' },
            studentsPreserved: { type: 'number' },
            paymentRecords: { type: 'number' },
            feeStructures: { type: 'number' },
            preservationDate: { type: 'string' }
          }
        }
      }
    }
  })
  async closeTerm(
    @Request() req,
    @Param('termId') termId: string,
    @Query('schoolId') schoolId?: string,
    @Body() dto?: CloseTermDto,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    
    const historicalData = await this.academicHistoryService.closeTerm(
      termId,
      superAdmin ? schoolId : user.schoolId,
      superAdmin,
    );

    return {
      success: true,
      message: `Term closed successfully. Preserved historical data for ${historicalData.studentsPreserved} students.`,
      data: historicalData
    };
  }

  @Post('close-academic-calendar/:calendarId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({
    summary: 'Close an academic calendar and preserve all historical data',
    description: 'Closes an entire academic calendar and automatically preserves comprehensive historical data for all students across all terms. This is typically done at the end of an academic year to archive all student records, financial data, and academic progress.'
  })
  @ApiParam({ name: 'calendarId', description: 'ID of the academic calendar to close' })
  @ApiQuery({ name: 'schoolId', required: false, description: 'School ID (for super admin)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Academic calendar closed successfully with all historical data preserved',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            academicCalendarId: { type: 'string' },
            totalTerms: { type: 'number' },
            totalStudents: { type: 'number' },
            studentsPreserved: { type: 'number' },
            paymentRecords: { type: 'number' },
            preservationDate: { type: 'string' }
          }
        }
      }
    }
  })
  async closeAcademicCalendar(
    @Request() req,
    @Param('calendarId') calendarId: string,
    @Query('schoolId') schoolId?: string,
    @Body() dto?: CloseAcademicCalendarDto,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    
    const historicalData = await this.academicHistoryService.closeAcademicCalendar(
      calendarId,
      superAdmin ? schoolId : user.schoolId,
      superAdmin,
    );

    return {
      success: true,
      message: `Academic calendar closed successfully. Preserved historical data for ${historicalData.totalStudents} unique students across ${historicalData.totalTerms} terms.`,
      data: historicalData
    };
  }

  @Post('term-history-summary/:termId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Get historical data summary for a specific term',
    description: 'Retrieves comprehensive historical data summary for a closed term including student counts, financial data, and preservation metrics.'
  })
  async getTermHistoricalSummary(
    @Request() req,
    @Param('termId') termId: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    
    const summary = await this.academicHistoryService.getTermHistoricalSummary(
      termId,
      superAdmin ? schoolId : user.schoolId,
      superAdmin,
    );

    return {
      success: true,
      data: summary
    };
  }

  @Post('calendar-history-summary/:calendarId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: 'Get historical data summary for an academic calendar',
    description: 'Retrieves comprehensive historical data summary for a closed academic calendar including all terms, student counts, and financial metrics.'
  })
  async getAcademicCalendarHistoricalSummary(
    @Request() req,
    @Param('calendarId') calendarId: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === 'SUPER_ADMIN';
    
    const summary = await this.academicHistoryService.getAcademicCalendarHistoricalSummary(
      calendarId,
      superAdmin ? schoolId : user.schoolId,
      superAdmin,
    );

    return {
      success: true,
      data: summary
    };
  }
}