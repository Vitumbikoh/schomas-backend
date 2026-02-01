import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { UserSettings } from './entities/user-settings.entity';
import { User } from '../user/entities/user.entity';
import { SchoolSettings } from './entities/school-settings.entity';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { LogsModule } from '../logs/logs.module';
import { Finance } from '../user/entities/finance.entity';
import { Parent } from '../user/entities/parent.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { AcademicCalendar } from './entities/academic-calendar.entity';
import { Period } from './entities/period.entity';
import { Term } from './entities/term.entity';
import { Class } from '../classes/entity/class.entity';
import { AcademicCalendarConstraintService } from './services/academic-calendar-constraint.service';
import { AcademicHistoryService } from './services/academic-history.service';
import { AcademicHistoryController } from './academic-history.controller';
import { TermHoliday } from './entities/term-holiday.entity';
import { StudentsModule } from '../student/student.module';
import { Enrollment } from '../academic/entities/enrollment.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { FeeStructure } from '../finance/entities/fee-structure.entity';

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
      Period,
      Term,
      TermHoliday,
      Class,
      Enrollment,
      FeePayment,
      FeeStructure
    ]),
    AuthModule,
    ConfigModule,
    LogsModule,
    forwardRef(() => StudentsModule),
  ],
  providers: [SettingsService, AcademicCalendarConstraintService, AcademicHistoryService],
  controllers: [SettingsController, AcademicHistoryController],
  exports: [TypeOrmModule, SettingsService, AcademicHistoryService],
})
export class SettingsModule {}