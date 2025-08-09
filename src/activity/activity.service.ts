// src/activity/activity.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from './activity.entity';
import { User } from '../user/entities/user.entity';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async createActivity(
    type: string,
    action: string,
    description: string,
    userId: string, // now we take just the user ID
    entityId?: string,
  ): Promise<Activity> {
    try {
      this.logger.log(`Creating activity: ${type} ${action} for user ${userId}`);
      this.logger.debug(`Activity details: ${description}, entityId: ${entityId}`);

      // Always fetch the full user entity
      const dbUser = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!dbUser) {
        this.logger.error(`User not found: ${userId}`);
        throw new Error(`User ${userId} not found`);
      }

      const activity = this.activityRepository.create({
        type,
        action,
        description,
        entityId,
        user: dbUser,
      });

      const savedActivity = await this.activityRepository.save(activity);
      this.logger.log(`Activity created successfully: ${savedActivity.id}`);

      return savedActivity;
    } catch (error) {
      this.logger.error(`Failed to create activity: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  async getRecentActivities(limit = 10): Promise<Activity[]> {
    try {
      this.logger.log(`Fetching recent activities (limit: ${limit})`);
      const activities = await this.activityRepository.find({
        relations: ['user'],
        order: { date: 'DESC' },
        take: limit,
      });
      this.logger.debug(`Found ${activities.length} activities`);
      return activities;
    } catch (error) {
      this.logger.error(`Failed to fetch activities: ${error.message}`);
      throw error;
    }
  }
}
