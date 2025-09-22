import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Request,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get all staff members for the school' })
  @ApiResponse({ status: 200, description: 'Staff members retrieved successfully' })
  async getAllStaff(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolId = isSuper ? req.query?.schoolId : req.user?.schoolId;
    
    return this.staffService.getAllStaff(schoolId, {
      page: Number(page),
      limit: Number(limit),
      search,
      role,
      status,
    });
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get staff statistics for the school' })
  async getStaffStats(@Request() req) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolId = isSuper ? req.query?.schoolId : req.user?.schoolId;
    
    return this.staffService.getStaffStats(schoolId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new staff member' })
  @ApiResponse({ status: 201, description: 'Staff member created successfully' })
  async createStaff(@Body() createStaffDto: CreateStaffDto, @Request() req) {
    const schoolId = req.user?.schoolId;
    return this.staffService.createStaff(createStaffDto, schoolId, req.user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get staff member by ID' })
  async getStaffById(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolId = isSuper ? req.query?.schoolId : req.user?.schoolId;
    
    return this.staffService.getStaffById(id, schoolId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update staff member' })
  async updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStaffDto: UpdateStaffDto,
    @Request() req,
  ) {
    return this.staffService.updateStaff(id, updateStaffDto, req.user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete staff member' })
  async deleteStaff(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.staffService.deleteStaff(id, req.user);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update staff member status' })
  async updateStaffStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: 'active' | 'inactive' | 'suspended',
    @Request() req,
  ) {
    return this.staffService.updateStaffStatus(id, status, req.user);
  }
}