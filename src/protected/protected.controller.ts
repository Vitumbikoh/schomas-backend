// src/protected/protected.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from 'src/user/enums/role.enum';


@Controller('protected')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ProtectedController {
  @Get('admin')
  @Roles(Role.ADMIN)
  adminOnly() {
    return { message: 'Admin access granted' };
  }

  @Get('student')
  @Roles(Role.STUDENT)
  studentOnly() {
    return { message: 'Student access granted' };
  }
}