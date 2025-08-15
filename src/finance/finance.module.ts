import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FeeAnalyticsController } from './fee-analytics.controller';
import { FeeAnalyticsService } from './fee-analytics.service';
import { Finance } from '../user/entities/finance.entity';
import { FeePayment } from './entities/fee-payment.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { Budget } from './entities/budget.entity';
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Department } from './entities/department.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { AcademicYear } from '../settings/entities/academic-year.entity';
import { Class } from '../classes/entity/class.entity';
import { ReceiptController } from './receipt.controller';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from 'src/logs/logs.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Finance,
      FeePayment,
      FeeStructure,
      Budget,
      Student,
      User,
      Department,
      Enrollment,
      AcademicYear,
      Class,
    ]),
    SettingsModule,
    LogsModule,
    AuthModule,
    ConfigModule,
  ],
  controllers: [FinanceController, FeeAnalyticsController, ReceiptController],
  providers: [FinanceService, FeeAnalyticsService],
  exports: [FinanceService, FeeAnalyticsService],
})
export class FinanceModule {}