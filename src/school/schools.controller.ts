import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@Controller('schools')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.SUPER_ADMIN)
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Post()
  create(
    @Body()
    body: {
      name: string;
      code: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.schoolsService.create(body);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    return this.schoolsService.findAll(search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schoolsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      status?: 'ACTIVE' | 'SUSPENDED';
      metadata?: Record<string, any>;
    },
  ) {
    return this.schoolsService.update(id, body);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.schoolsService.suspend(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.schoolsService.activate(id);
  }
}
