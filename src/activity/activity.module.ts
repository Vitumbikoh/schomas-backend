// src/activity/activity.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from './activity.entity';
import { ActivityService } from './activity.service';
import { ActivitiesController } from './activities.controller';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../user/users.module';
import { User } from '../user/entities/user.entity';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Activity, User]),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    ConfigModule
  ],
  controllers: [ActivitiesController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}