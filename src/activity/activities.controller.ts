// activities/activities.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activityService: ActivityService) {}

  @UseGuards(JwtAuthGuard)
  @Get('recent')
  async getRecentActivities() {
    const activities = await this.activityService.getRecentActivities();
    return { activities };
  }
}