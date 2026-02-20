import { Controller, Get, UseGuards, Request, Query, Param, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ActivitiesService } from './activity.service';
import { ActivityDto } from './activity.dto';
import { Role } from 'src/user/enums/role.enum';

@ApiTags('Activities')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get('recent')
  @UseGuards(AuthGuard('jwt')) // Specify the strategy
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent activities (create/update operations only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of activities to return (default: 10)' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of recent activities (excluding read/query operations)', 
    type: [ActivityDto] 
  })
  async getRecentActivities(
    @Request() req,
    @Query('limit') limit?: number,
    @Query('schoolId') schoolIdFilter?: string,
  ) {
    const isSuperAdmin = req.user?.role === Role.SUPER_ADMIN;
    const schoolId = isSuperAdmin ? schoolIdFilter || req.user?.schoolId : req.user?.schoolId;
    const activityLimit = limit ? Number(limit) : 10;
    
    return this.activitiesService.getRecentActivities(activityLimit, schoolId, isSuperAdmin);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single activity by id with school isolation' })
  @ApiResponse({ status: 200, description: 'Activity log entry', type: ActivityDto })
  @ApiResponse({ status: 404, description: 'Activity not found' })
  async getActivityById(@Request() req, @Param('id') id: string, @Query('schoolId') schoolIdFilter?: string) {
    const isSuperAdmin = req.user?.role === Role.SUPER_ADMIN;
    const schoolId = isSuperAdmin ? schoolIdFilter || req.user?.schoolId : req.user?.schoolId;
    const activity = await this.activitiesService.getActivityById(id, schoolId, isSuperAdmin);
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }
}
