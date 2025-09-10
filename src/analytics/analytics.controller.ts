import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('class-performance')
  async classPerformance(
    @Request() req,
    @Query('classId') classId: string, 
    @Query('TermId') TermId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getClassPerformance(classId, TermId, effectiveSchoolId, isSuper);
  }

  @Get('course-averages')
  async courseAverages(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('scope') scope: 'current-year' | 'all' = 'current-year',
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getCourseAverages(TermId, scope, effectiveSchoolId, isSuper);
  }

  @Get('attendance-overview')
  async attendanceOverview(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getAttendanceOverview(TermId, effectiveSchoolId, isSuper);
  }

  @Get('attendance-by-class')
  async attendanceByClass(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getAttendanceByClass(TermId, effectiveSchoolId, isSuper);
  }

  @Get('fee-collection-status')
  async feeCollectionStatus(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getFeeCollectionStatus(TermId, effectiveSchoolId, isSuper);
  }

  @Get('current-term')
  async currentTerm(@Request() req) {
    // Term might be global or school-specific depending on your business logic
    return this.analyticsService.getCurrentTermDetails();
  }

  @Get('dashboard-summary')
  async dashboardSummary(
    @Request() req,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getDashboardSummary(effectiveSchoolId, isSuper);
  }

  @Get('teacher-performance')
  async teacherPerformance(
    @Request() req,
    @Query('termId') termId?: string,
    @Query('schoolId') schoolIdFilter?: string,
    @Query('limit') limit?: string,
    @Query('passThreshold') passThreshold?: string,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getTeacherPerformance({
      termId,
      schoolId: effectiveSchoolId,
      superAdmin: isSuper,
      passThreshold: passThreshold ? parseFloat(passThreshold) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
