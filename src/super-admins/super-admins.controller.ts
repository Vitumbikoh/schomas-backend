import { Body, Controller, Post, UseGuards, Get } from '@nestjs/common';
import { SuperAdminsService } from './super-admins.service';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { Public } from '../auth/auth.guard';

@Controller('super-admins')
export class SuperAdminsController {
  constructor(private readonly superAdminsService: SuperAdminsService) {}

  // Public bootstrap: only allowed when there are zero super admins
  @Public()
  @Post('bootstrap')
  bootstrap(@Body() body: CreateSuperAdminDto) {
    return this.superAdminsService.bootstrapFirst(body);
  }

  // Authenticated creation of additional super admins
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Post()
  create(@Body() body: CreateSuperAdminDto) {
    return this.superAdminsService.create(body);
  }
}
