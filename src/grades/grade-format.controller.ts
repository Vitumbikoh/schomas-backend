import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request, UsePipes, ValidationPipe } from '@nestjs/common';
import { GradeFormatService } from './grade-format.service';
import { CreateGradeFormatDto, UpdateGradeFormatDto, InitializeGradeFormatsDto } from './dtos/grade-format.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';

// Matches frontend calls: /api/admin/grading-formats
@Controller('admin/grading-formats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class GradeFormatController {
  constructor(private readonly service: GradeFormatService) {}

  @Get()
  async list(@Request() req) {
    await this.service.ensureGlobalDefaults();
    return this.service.getFormatsForSchool(req.user.schoolId);
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@Body() dto: CreateGradeFormatDto, @Request() req) {
    return this.service.createFormat(dto, req.user);
  }

  @Put(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(@Param('id') id: string, @Body() dto: UpdateGradeFormatDto, @Request() req) {
    return this.service.updateFormat(id, dto, req.user);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    return this.service.deleteFormat(id, req.user);
  }

  @Post('initialize')
  async initialize(@Body() dto: InitializeGradeFormatsDto, @Request() req) {
    return this.service.initializeDefaults(dto, req.user);
  }
}
