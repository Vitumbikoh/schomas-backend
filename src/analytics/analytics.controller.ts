import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  async classPerformance(@Query('classId') classId: string, @Query('academicYearId') academicYearId?: string) {
    return this.analyticsService.getClassPerformance(classId, academicYearId);
  }

  @Get('course-averages')
  async courseAverages(
    @Query('academicYearId') academicYearId?: string,
    @Query('scope') scope: 'current-year' | 'all' = 'current-year',
  ) {
    return this.analyticsService.getCourseAverages(academicYearId, scope);
  }

  @Get('attendance-overview')
  async attendanceOverview(@Query('academicYearId') academicYearId?: string) {
    return this.analyticsService.getAttendanceOverview(academicYearId);
  }

  @Get('attendance-by-class')
  async attendanceByClass(@Query('academicYearId') academicYearId?: string) {
    return this.analyticsService.getAttendanceByClass(academicYearId);
  }

  @Get('fee-collection-status')
  async feeCollectionStatus(@Query('academicYearId') academicYearId?: string) {
    return this.analyticsService.getFeeCollectionStatus(academicYearId);
  }

  @Get('current-academic-year')
  async currentAcademicYear() {
    return this.analyticsService.getCurrentAcademicYearDetails();
  }

  @Get('dashboard-summary')
  async dashboardSummary() {
    return this.analyticsService.getDashboardSummary();
  }
}
