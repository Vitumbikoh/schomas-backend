import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationRead, UserSettings, Student, Parent])],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}