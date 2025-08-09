import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ActivitiesService } from './activity.service';
import { ActivityDto } from './activity.dto';

@ApiTags('Activities')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get('recent')
  @UseGuards(AuthGuard('jwt')) // Specify the strategy
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent activities' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of recent activities', 
    type: [ActivityDto] 
  })
  async getRecentActivities() {
    return this.activitiesService.getRecentActivities();
  }
}