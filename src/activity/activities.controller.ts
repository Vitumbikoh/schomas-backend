import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ActivitiesService } from './activity.service';
import { ActivityDto } from './activity.dto';

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
    @Query('limit') limit?: number
  ) {
    const schoolId = req.user?.schoolId;
    const activityLimit = limit ? Number(limit) : 10;
    
    return this.activitiesService.getRecentActivities(activityLimit, schoolId);
  }
}