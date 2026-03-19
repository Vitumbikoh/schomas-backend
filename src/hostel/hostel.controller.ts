import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { HostelService } from './hostel.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { CreateHostelDto, UpdateHostelDto } from './dtos/hostel.dto';
import { CreateHostelRoomDto, UpdateHostelRoomDto } from './dtos/hostel-room.dto';
import { UpdateHostelSetupDto } from './dtos/hostel-setup.dto';
import {
  CreateHostelAllocationDto,
  ReleaseAllHostelAllocationsDto,
  ReleaseHostelAllocationDto,
} from './dtos/hostel-allocation.dto';

@Controller('hostels')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HostelController {
  constructor(private readonly hostelService: HostelService) {}

  private resolveSchoolId(req: any, schoolId?: string): string {
    const role = req.user?.role;
    const fallback = req.user?.schoolId;
    if (role === Role.SUPER_ADMIN) {
      return schoolId || fallback;
    }
    return fallback;
  }

  @Get('summary')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  summary(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.getSummary(resolvedSchoolId);
  }

  @Get('setup')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  getSetup(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.getSetup(resolvedSchoolId);
  }

  @Put('setup')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateSetup(
    @Request() req,
    @Body() dto: UpdateHostelSetupDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.updateSetup(resolvedSchoolId, dto);
  }

  @Get('students/search')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  searchStudents(
    @Request() req,
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    if (!q || !q.trim()) return [];
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.searchStudents({
      schoolId: resolvedSchoolId,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('allocations')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  listAllocations(
    @Request() req,
    @Query('activeOnly') activeOnly?: string,
    @Query('hostelId') hostelId?: string,
    @Query('studentSearch') studentSearch?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.listAllocations(resolvedSchoolId, {
      activeOnly: activeOnly !== 'false',
      hostelId,
      studentSearch,
    });
  }

  @Post('allocations')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  allocate(
    @Request() req,
    @Body() dto: CreateHostelAllocationDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.allocateStudent(resolvedSchoolId, dto);
  }

  @Post('allocations/:id/release')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  releaseAllocation(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReleaseHostelAllocationDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.releaseAllocation(resolvedSchoolId, id, dto);
  }

  @Post('allocations/release-all')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  releaseAllAllocations(
    @Request() req,
    @Body() dto: ReleaseAllHostelAllocationsDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.releaseAllAllocations(resolvedSchoolId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  listHostels(
    @Request() req,
    @Query('includeRooms') includeRooms?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.listHostels(resolvedSchoolId, includeRooms === 'true');
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createHostel(
    @Request() req,
    @Body() dto: CreateHostelDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.createHostel(resolvedSchoolId, dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateHostel(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateHostelDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.updateHostel(resolvedSchoolId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  deleteHostel(
    @Request() req,
    @Param('id') id: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.deleteHostel(resolvedSchoolId, id);
  }

  @Get(':hostelId/rooms')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  listRooms(
    @Request() req,
    @Param('hostelId') hostelId: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.listRooms(resolvedSchoolId, hostelId);
  }

  @Post(':hostelId/rooms')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createRoom(
    @Request() req,
    @Param('hostelId') hostelId: string,
    @Body() dto: CreateHostelRoomDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.createRoom(resolvedSchoolId, hostelId, dto);
  }

  @Put('rooms/:roomId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateRoom(
    @Request() req,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateHostelRoomDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.updateRoom(resolvedSchoolId, roomId, dto);
  }

  @Delete('rooms/:roomId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  deleteRoom(
    @Request() req,
    @Param('roomId') roomId: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.hostelService.deleteRoom(resolvedSchoolId, roomId);
  }
}
