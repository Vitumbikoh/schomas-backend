import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/user/enums/role.enum';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.STUDENT, Role.PARENT, Role.FINANCE, Role.TEACHER)
  async getDashboardStats(@Request() req) {
    const userId = req.user.id;
    const role = req.user.role;

    switch (role) {
      case Role.ADMIN:
        return { stats: await this.dashboardService.getAdminStats() };
      case Role.TEACHER:
        return { stats: await this.dashboardService.getTeacherStats(userId) };
      case Role.STUDENT:
        return { stats: await this.dashboardService.getStudentStats(userId) };
      case Role.PARENT:
        return { stats: await this.dashboardService.getParentStats(userId) };
      case Role.FINANCE:
        return { stats: await this.dashboardService.getFinanceStats() };
      default:
        return { message: 'No dashboard data available for this role' };
    }
  }
}