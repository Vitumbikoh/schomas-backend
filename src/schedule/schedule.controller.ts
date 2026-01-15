import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiBearerAuth, ApiTags, ApiResponse } from '@nestjs/swagger';
import { Role } from 'src/user/enums/role.enum';
import { Roles } from 'src/user/decorators/roles.decorator';
import { Body, UploadedFile, UseInterceptors, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateScheduleDto, UpdateScheduleDto, CloneScheduleDto, UpsertWeeklyGridDto, ExportScheduleCsvDto, GridItemDto } from './dtos/schedule.dto';

@ApiTags('Schedule')
@ApiBearerAuth()
@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly systemLoggingService: SystemLoggingService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({
    status: 201,
    description: 'Schedule created',
  })
  async create(
    @Request() req,
    @Body() createScheduleDto: CreateScheduleDto,
  ) {
    const created = await this.scheduleService.create(createScheduleDto, req.user?.schoolId);
    await this.systemLoggingService.logAction({
      action: 'SCHEDULE_CREATED',
      module: 'SCHEDULE',
      level: 'info',
      entityId: created.id,
      entityType: 'Schedule',
      newValues: created as any
    });
    return created;
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({
    status: 200,
    description: 'Schedule dashboard overview',
  })
  async getDashboardOverview() {
    return this.scheduleService.getDashboardOverview();
  }

  @Get()
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiResponse({
    status: 200,
    description: 'List of schedules',
  })
  async findAll(
    @Request() req,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('search') search?: string,
  ) {
    return this.scheduleService.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      search,
      schoolId: req.user?.schoolId,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiResponse({
    status: 200,
    description: 'Schedule details',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.scheduleService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({
    status: 200,
    description: 'Schedule updated',
  })
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    const before = await this.scheduleService.findOne(id);
    const updated = await this.scheduleService.update(id, updateScheduleDto, req.user?.schoolId);
    await this.systemLoggingService.logAction({
      action: 'SCHEDULE_UPDATED',
      module: 'SCHEDULE',
      level: 'info',
      entityId: id,
      entityType: 'Schedule',
      oldValues: before as any,
      newValues: updated as any
    });
    return updated;
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 200, description: 'Schedule deleted' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const before = await this.scheduleService.findOne(id);
    const result = await this.scheduleService.remove(id);
    await this.systemLoggingService.logAction({
      action: 'SCHEDULE_DELETED',
      module: 'SCHEDULE',
      level: 'info',
      entityId: id,
      entityType: 'Schedule',
      oldValues: before as any
    });
    return result;
  }

  @Delete('bulk/delete')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 200, description: 'Bulk schedules deleted' })
  async bulkDelete(@Request() req, @Body() deleteData: { ids?: string[]; classId?: string; deleteAll?: boolean }) {
    let result;
    
    if (deleteData.deleteAll) {
      // Delete all schedules for all classes in the school
      result = await this.scheduleService.bulkDeleteAllSchedules(req.user?.schoolId);
    } else if (deleteData.classId) {
      // Delete all schedules for a specific class
      result = await this.scheduleService.bulkDeleteByClass(deleteData.classId, req.user?.schoolId);
    } else if (deleteData.ids && deleteData.ids.length > 0) {
      // Delete specific schedules by IDs
      result = await this.scheduleService.bulkDelete(deleteData.ids, req.user?.schoolId);
    } else {
      throw new Error('Invalid delete request. Provide ids, classId, or set deleteAll to true.');
    }
    
    await this.systemLoggingService.logAction({
      action: 'SCHEDULES_BULK_DELETED',
      module: 'SCHEDULE',
      level: 'info',
      entityType: 'Schedule',
      metadata: { 
        deletedCount: result.deleted, 
        totalRequested: deleteData.ids?.length || 'all',
        deleteType: deleteData.deleteAll ? 'all' : deleteData.classId ? 'class' : 'specific'
      }
    });
    return result;
  }

  @Get('teacher/:teacherId')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({
    status: 200,
    description: 'Teacher schedules',
  })
  async findByTeacher(@Param('teacherId', ParseUUIDPipe) teacherId: string) {
    return this.scheduleService.findByTeacher(teacherId);
  }

  @Get('course/:courseId')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiResponse({
    status: 200,
    description: 'Course schedules',
  })
  async findByCourse(@Param('courseId', ParseUUIDPipe) courseId: string, @Request() req) {
    return this.scheduleService.findByCourse(courseId, req.user?.schoolId);
  }

  // Weekly timetable
  @Get('class/:classId/weekly')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiResponse({ status: 200, description: 'Weekly timetable for class' })
  async getWeekly(
    @Request() req,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('days') days?: string,
  ) {
    const dayList = days ? days.split(',') : undefined;
    return this.scheduleService.getWeeklyTimetable(classId, req.user?.schoolId, dayList as any);
  }

  // Weekly timetable (alternative endpoint for compatibility)
  @Get('class/:classId/timetable')
  @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiResponse({ status: 200, description: 'Weekly timetable for class' })
  async getTimetable(
    @Request() req,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('days') days?: string,
  ) {
    const dayList = days ? days.split(',') : undefined;
    return this.scheduleService.getWeeklyTimetable(classId, req.user?.schoolId, dayList as any);
  }

  // Weekly timetable for teacher
  @Get('teacher/:teacherId/weekly')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({ status: 200, description: 'Weekly timetable for teacher' })
  async getTeacherWeekly(
    @Request() req,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @Query('days') days?: string,
  ) {
    const dayList = days ? days.split(',') : undefined;
    return this.scheduleService.getWeeklyTimetableForTeacher(teacherId, req.user?.schoolId, dayList as any);
  }

  // Clone schedules
  @Post('clone')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 201, description: 'Schedules cloned' })
  async clone(
    @Request() req,
    @Body() dto: CloneScheduleDto,
  ) {
    const res = await this.scheduleService.cloneClassSchedule(dto.fromClassId, dto.toClassId, req.user?.schoolId, dto.overwrite);
    await this.systemLoggingService.logAction({
      action: 'SCHEDULES_CLONED',
      module: 'SCHEDULE',
      level: 'info',
      entityType: 'Schedule',
      metadata: dto as any,
      newValues: res as any,
    });
    return res;
  }

  // Bulk import via Excel/CSV
  @Post('bulk-upload')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({ status: 201, description: 'Bulk schedule upload processed' })
  async bulkUpload(@Request() req, @UploadedFile() file: any) {
    if (!file) throw new Error('No file uploaded');
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    if (!allowed.includes(file.mimetype)) throw new Error('Unsupported file type. Upload .xlsx, .xls or .csv');
    return this.scheduleService.bulkImport(file.buffer, req.user?.schoolId);
  }

  // Weekly Grid Management
  @Post('grid-upsert')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 201, description: 'Weekly grid updated' })
  async upsertWeeklyGrid(
    @Request() req,
    @Body() dto: UpsertWeeklyGridDto,
  ) {
    const result = await this.scheduleService.upsertWeeklyGrid(dto, req.user?.schoolId);
    await this.systemLoggingService.logAction({
      action: 'WEEKLY_GRID_UPSERTED',
      module: 'SCHEDULE',
      level: 'info',
      entityType: 'Schedule',
      metadata: { classId: dto.classId, itemCount: dto.schedules.length } as any,
      newValues: result as any,
    });
    return result;
  }

  // CSV Export for specific class
  @Get('class/:classId/export.csv')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({ status: 200, description: 'Schedule exported as CSV' })
  async exportClassCSV(
    @Request() req,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('days') days?: string,
  ) {
    const dto: ExportScheduleCsvDto = {
      classId,
      days: days ? days.split(',') : undefined,
      format: 'csv'
    };
    const csvContent = await this.scheduleService.exportScheduleCSV(dto, req.user?.schoolId);
    
    // Return CSV with proper headers
    return {
      content: csvContent,
      filename: `schedule-class-${classId}-${new Date().toISOString().split('T')[0]}.csv`,
      contentType: 'text/csv'
    };
  }

  // CSV Export for specific teacher
  @Get('teacher/:teacherId/export.csv')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({ status: 200, description: 'Teacher schedule exported as CSV' })
  async exportTeacherCSV(
    @Request() req,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @Query('days') days?: string,
  ) {
    const dto: ExportScheduleCsvDto = {
      teacherId,
      days: days ? days.split(',') : undefined,
      format: 'csv'
    };
    const csvContent = await this.scheduleService.exportScheduleCSV(dto, req.user?.schoolId);
    
    return {
      content: csvContent,
      filename: `schedule-teacher-${teacherId}-${new Date().toISOString().split('T')[0]}.csv`,
      contentType: 'text/csv'
    };
  }

  // Validate schedule conflicts without saving
  @Post('validate-conflicts')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 200, description: 'Conflict validation results' })
  async validateConflicts(
    @Request() req,
    @Body() dto: { classId: string; schedules: GridItemDto[] },
  ) {
    const results: Array<{ item: GridItemDto; validation: any }> = [];
    for (const item of dto.schedules) {
      const result = await (this.scheduleService as any).validateGridItemConflicts(
        item, 
        dto.classId, 
        req.user?.schoolId, 
        item.id
      );
      results.push({ item, validation: result });
    }
    return results;
  }
}