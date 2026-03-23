import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('class-performance')
  @Roles(Role.ADMIN)
  async classPerformance(
    @Request() req,
    @Query('classId') classId: string, 
    @Query('TermId') TermId?: string,
    @Query('termId') termId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getClassPerformance(classId, termId || TermId, effectiveSchoolId, isSuper);
  }

  @Get('course-averages')
  @Roles(Role.ADMIN)
  async courseAverages(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('termId') termId?: string,
    @Query('scope') scope: 'current-year' | 'all' = 'current-year',
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getCourseAverages(termId || TermId, scope, effectiveSchoolId, isSuper);
  }

  @Get('attendance-overview')
  @Roles(Role.ADMIN, Role.PRINCIPAL)
  async attendanceOverview(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('termId') termId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getAttendanceOverview(termId || TermId, effectiveSchoolId, isSuper);
  }

  @Get('attendance-by-class')
  async attendanceByClass(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('termId') termId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getAttendanceByClass(termId || TermId, effectiveSchoolId, isSuper);
  }

  @Get('fee-collection-status')
  @Roles(Role.ADMIN, Role.PRINCIPAL)
  async feeCollectionStatus(
    @Request() req,
    @Query('TermId') TermId?: string,
    @Query('termId') termId?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getFeeCollectionStatus(termId || TermId, effectiveSchoolId, isSuper);
  }

  @Get('current-term')
  async currentTerm(@Request() req) {
    // Term might be global or school-specific depending on your business logic
    return this.analyticsService.getCurrentTermDetails();
  }

  @Get('dashboard-summary')
  @Roles(Role.ADMIN, Role.PRINCIPAL)
  async dashboardSummary(
    @Request() req,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
    return this.analyticsService.getDashboardSummary(effectiveSchoolId, isSuper);
  }

  @Get('teacher-performance')
  @Roles(Role.ADMIN)
  async teacherPerformance(
    @Request() req,
    @Query('termId') termId?: string,
    @Query('months') months?: string,
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
      months: months ? parseInt(months, 10) : undefined,
      passThreshold: passThreshold ? parseFloat(passThreshold) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
