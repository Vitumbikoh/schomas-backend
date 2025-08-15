import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { FeeAnalyticsService } from './fee-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('fee-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE)
export class FeeAnalyticsController {
  constructor(private readonly feeAnalyticsService: FeeAnalyticsService) {}

  @Get('dashboard/:academicYearId')
  async getFeeAnalytics(@Param('academicYearId') academicYearId: string) {
    return this.feeAnalyticsService.getFeeAnalytics(academicYearId);
  }

  @Get('student/:studentId')
  async getStudentFeeDetails(
    @Param('studentId') studentId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    return this.feeAnalyticsService.getStudentFeeDetails(studentId, academicYearId);
  }

  @Get('summary/:academicYearId')
  async getPaymentSummary(@Param('academicYearId') academicYearId: string) {
    return this.feeAnalyticsService.calculatePaymentSummary(academicYearId);
  }
}
