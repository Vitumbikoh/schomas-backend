import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiBearerAuth, ApiTags, ApiResponse } from '@nestjs/swagger';
import { Role } from 'src/user/enums/role.enum';
import { Roles } from 'src/user/decorators/roles.decorator';

@ApiTags('Schedule')
@ApiBearerAuth()
@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post()
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiResponse({
    status: 201,
    description: 'Schedule created',
  })
  async create(
    @Body()
    createScheduleDto: {
      classId: string;
      date: Date;
      day: string;
      startTime: Date;
      endTime: Date;
      courseId: string;
      teacherId: string;
      classroomId: string;
      isActive?: boolean;
    },
  ) {
    return this.scheduleService.create(createScheduleDto);
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
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('search') search?: string,
  ) {
    return this.scheduleService.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      search,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    updateScheduleDto: {
      date?: Date;
      day?: string;
      startTime?: Date;
      endTime?: Date;
      courseId?: string;
      teacherId?: string;
      classroomId?: string;
      classId?: string;
      isActive?: boolean;
    },
  ) {
    return this.scheduleService.update(id, updateScheduleDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 200, description: 'Schedule deleted' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.scheduleService.remove(id);
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
  async findByCourse(@Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.scheduleService.findByCourse(courseId);
  }
}