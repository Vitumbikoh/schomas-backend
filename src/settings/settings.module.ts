import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { UserSettings } from './entities/user-settings.entity';
import { User } from '../user/entities/user.entity';
import { SchoolSettings } from './entities/school-settings.entity';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { Finance } from '../user/entities/finance.entity';
import { Parent } from '../user/entities/parent.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { AcademicCalendar } from './entities/academic-calendar.entity';
import { Term } from './entities/term.entity';
import { AcademicYear } from './entities/academic-year.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserSettings, 
      SchoolSettings, 
      User, 
      Teacher, 
      Student, 
      Parent, 
      Finance,
      AcademicCalendar,
      Term,
      AcademicYear
    ]),
    AuthModule,
    ConfigModule,
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [TypeOrmModule, SettingsService],
})
export class SettingsModule {}