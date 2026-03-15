import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { UserSettings } from '../settings/entities/user-settings.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { User } from '../user/entities/user.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Finance } from '../user/entities/finance.entity';
import { NotificationDeliveryService } from './notification-delivery.service';
import { ConfigModule } from '../config/config.module';
import { SchoolSettings } from '../settings/entities/school-settings.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule,
    WhatsAppModule,
    TypeOrmModule.forFeature([Notification, NotificationRead, UserSettings, Student, Parent, User, Teacher, Finance, SchoolSettings]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationDeliveryService],
  exports: [NotificationService],
})
export class NotificationModule {}