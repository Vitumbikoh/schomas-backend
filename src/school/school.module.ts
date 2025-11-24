import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { School } from './entities/school.entity';
import { SchoolAdminCredentials } from './entities/school-admin-credentials.entity';
import { SchoolsService } from './schools.service';
import { SchoolsController } from './schools.controller';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { UsersModule } from '../user/users.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [TypeOrmModule.forFeature([School, SchoolAdminCredentials]), AuthModule, ConfigModule, UsersModule, DatabaseModule, NotificationModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolModule {}
