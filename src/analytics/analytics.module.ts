import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grade } from '../grades/entity/grade.entity';
import { Class } from '../classes/entity/class.entity';
import { Course } from '../course/entities/course.entity';
import { Attendance } from '../attendance/entity/attendance.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { AcademicYear } from '../settings/entities/academic-year.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { FeeStructure } from '../finance/entities/fee-structure.entity';
import { SettingsModule } from '../settings/settings.module';
import { FinanceModule } from '../finance/finance.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Grade,
      Class,
      Course,
      Attendance,
      FeePayment,
      Student,
      Teacher,
      AcademicYear,
      Enrollment,
      FeeStructure,
    ]),
    SettingsModule,
    FinanceModule, // This imports all exported providers from FinanceModule
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}