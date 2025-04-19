import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/user/enums/role.enum';

@Controller('dashboard')
export class DashboardController {
  @Get('redirect')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.STUDENT, Role.PARENT, Role.FINANCE, Role.TEACHER)
  redirectToDashboard(@Request() req) {
    return {
      redirectTo: [Role.ADMIN, Role.FINANCE, Role.TEACHER].includes(req.user.role)
        ? '/admin-dashboard'
        : '/student-dashboard',
    };
  }
}