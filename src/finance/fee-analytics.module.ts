import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeAnalyticsController } from './fee-analytics.controller';
import { FeePayment } from './entities/fee-payment.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { Student } from '../user/entities/student.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { AcademicYear } from '../settings/entities/academic-year.entity';
import { Class } from '../classes/entity/class.entity';
import { FeeAnalyticsService } from './fee-analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeePayment,
      FeeStructure,
      Student,
      Enrollment,
      AcademicYear,
      Class,
    ]),
  ],
  controllers: [FeeAnalyticsController],
  providers: [FeeAnalyticsService],
  exports: [FeeAnalyticsService],
})
export class FeeAnalyticsModule {}
