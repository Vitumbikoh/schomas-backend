import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogsService } from './logs.service';
import { SystemLoggingService } from './system-logging.service';
import { Log } from './logs.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { FeeStructure } from '../finance/entities/fee-structure.entity';
import { Student } from '../user/entities/student.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { LearningMaterial } from '../learning-materials/entities/learning-material.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Log,
      FeePayment,
      FeeStructure,
      Student,
      Enrollment,
      LearningMaterial,
    ]),
  ],
  providers: [LogsService, SystemLoggingService],
  exports: [LogsService, SystemLoggingService],
})
export class LogsModule {}
