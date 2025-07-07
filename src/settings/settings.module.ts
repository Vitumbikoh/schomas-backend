import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { UserSettings } from './entities/user-settings.entity';
import { User } from 'src/user/entities/user.entity';
import { SchoolSettings } from './entities/school-settings.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from 'src/config/config.module';
import { Finance } from 'src/user/entities/finance.entity';
import { Parent } from 'src/user/entities/parent.entity';
import { Student } from 'src/user/entities/student.entity';
import { Teacher } from 'src/user/entities/teacher.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSettings, SchoolSettings, User, Teacher, Student, Parent, Finance]),
    AuthModule,
    ConfigModule,
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [ TypeOrmModule],
})
export class SettingsModule {}
