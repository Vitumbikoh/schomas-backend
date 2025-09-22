import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { PayrollService } from './payroll.service';
import { CreateRunDto } from './dtos/create-run.dto';
import { CreatePayComponentDto, UpdatePayComponentDto } from './dtos/pay-component.dto';
import { CreateStaffAssignmentDto, UpdateStaffAssignmentDto } from './dtos/staff-assignment.dto';

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('runs')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'List salary runs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listRuns(@Request() req, @Query('page') page = 1, @Query('limit') limit = 20) {
    const user = req.user;
    return this.payrollService.listRuns(user.schoolId, Number(page), Number(limit));
  }

  @Post('runs')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new salary run' })
  async createRun(@Request() req, @Body() dto: CreateRunDto) {
    return this.payrollService.createRun(dto, req.user);
  }

  @Get('runs/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  async getRun(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.getRun(id, req.user.schoolId);
  }

  @Put('runs/:id/prepare')
  @Roles(Role.FINANCE)
  async prepare(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.prepareRun(id, req.user);
  }

  @Put('runs/:id/submit')
  @Roles(Role.FINANCE)
  async submit(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.submitRun(id, req.user);
  }

  @Put('runs/:id/approve')
  @Roles(Role.ADMIN)
  async approve(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.approveRun(id, req.user);
  }

  @Put('runs/:id/reject')
  @Roles(Role.ADMIN)
  async reject(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.rejectRun(id, req.user);
  }

  @Put('runs/:id/finalize')
  @Roles(Role.ADMIN)
  async finalize(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.finalizeRun(id, req.user);
  }

  @Delete('runs/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a salary run' })
  async deleteRun(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.deleteRun(id, req.user.schoolId);
  }

  @Get('runs/:id/items')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get salary items for a run' })
  async getRunItems(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.getRunItems(id, req.user.schoolId);
  }

  @Get('runs/:id/history')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get approval history for a run' })
  async getApprovalHistory(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.getApprovalHistory(id, req.user.schoolId);
  }

  // Pay Components
  @Get('components')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'List pay components' })
  async listComponents(@Request() req) {
    return this.payrollService.listPayComponents(req.user.schoolId);
  }

  @Post('components')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Create pay component' })
  async createComponent(@Request() req, @Body() dto: CreatePayComponentDto) {
    return this.payrollService.createPayComponent(dto, req.user);
  }

  @Get('components/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  async getComponent(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.getPayComponent(id, req.user.schoolId);
  }

  @Put('components/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  async updateComponent(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdatePayComponentDto) {
    return this.payrollService.updatePayComponent(id, dto, req.user);
  }

  @Delete('components/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  async deleteComponent(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.payrollService.deletePayComponent(id, req.user);
    return { message: 'Pay component deleted successfully' };
  }

  // Staff with calculated salaries
  @Get('staff-with-salaries')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Get all staff with calculated salaries' })
  async getStaffWithSalaries(@Request() req) {
    return this.payrollService.getStaffWithSalaries(req.user.schoolId);
  }

  // Debug endpoint to check staff assignments
  @Get('debug/staff-assignments/:staffId')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Debug staff assignments for a specific staff member' })
  async debugStaffAssignments(@Request() req, @Param('staffId') staffId: string) {
    const assignments = await this.payrollService.listStaffAssignments(staffId);
    return {
      staffId,
      assignments,
      count: assignments.length,
    };
  }

  // Staff Pay Assignments
  @Get('assignments')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'List staff pay assignments' })
  @ApiQuery({ name: 'staffId', required: false })
  async listAssignments(@Request() req, @Query('staffId') staffId?: string) {
    return this.payrollService.listStaffAssignments(req.user.schoolId, staffId);
  }

  @Post('assignments')
  @Roles(Role.FINANCE, Role.ADMIN)
  @ApiOperation({ summary: 'Create staff pay assignment' })
  async createAssignment(@Request() req, @Body() dto: CreateStaffAssignmentDto) {
    return this.payrollService.createStaffAssignment(dto, req.user);
  }

  @Get('assignments/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  async getAssignment(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.payrollService.getStaffAssignment(id, req.user.schoolId);
  }

  @Put('assignments/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  async updateAssignment(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateStaffAssignmentDto) {
    return this.payrollService.updateStaffAssignment(id, dto, req.user);
  }

  @Delete('assignments/:id')
  @Roles(Role.FINANCE, Role.ADMIN)
  async deleteAssignment(@Request() req, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    await this.payrollService.deleteStaffAssignment(id, req.user);
    return { message: 'Staff assignment deleted successfully' };
  }
}
