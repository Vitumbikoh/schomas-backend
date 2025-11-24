import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';

@Controller('system')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('overview')
  getOverview(@Request() req) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolId = isSuper ? req.query?.schoolId || req.user?.schoolId : req.user?.schoolId;
    return this.systemService.getSystemOverview(schoolId, isSuper);
  }

  @Get('resources')
  getResources() {
    return this.systemService.getResourceUsage();
  }

  @Get('services')
  getServices() {
    return this.systemService.getServicesStatus();
  }
}
