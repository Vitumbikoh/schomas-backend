import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceController } from './finance.controller';
import { EnhancedFinanceController } from './enhanced-finance.controller';
import { FinanceService } from './finance.service';
import { Finance } from '../user/entities/finance.entity';
import { FeePayment } from './entities/fee-payment.entity';
import { FeeStructure } from './entities/fee-structure.entity';
import { Budget } from './entities/budget.entity';
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Department } from './entities/department.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { Term } from '../settings/entities/term.entity';
import { AcademicCalendar } from '../settings/entities/academic-calendar.entity';
import { Class } from '../classes/entity/class.entity';
import { ReceiptController } from './receipt.controller';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from 'src/logs/logs.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { FeeAnalyticsService } from './services/fee-analytics.service';
import { StudentFeeExpectationService } from './student-fee-expectation.service';
import { Expense } from '../expenses/entities/expense.entity';
import { CreditLedger } from './entities/credit-ledger.entity';

// Enhanced entities
import { StudentAcademicRecord } from './entities/student-academic-record.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { ExpectedFee } from './entities/expected-fee.entity';
import { GraduateOutstandingBalance } from './entities/graduate-outstanding-balance.entity';
import { Payment } from './entities/payment.entity';

// Enhanced services
import { EnhancedFinanceService } from './services/enhanced-finance.service';
import { PaymentAllocationService } from './services/payment-allocation.service';
import { CarryForwardService } from './services/carry-forward.service';
import { GraduateFeesService } from './services/graduate-fees.service';

// Controllers
import { GraduateFeesController } from './controllers/graduate-fees.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Existing entities
      Finance,
      FeePayment,
      FeeStructure,
      Budget,
      Student,
      User,
      Department,
      Enrollment,
      Term,
      AcademicCalendar,
      Class,
      Expense,
      CreditLedger,
      // Enhanced entities
      StudentAcademicRecord,
      PaymentAllocation,
      ExpectedFee,
      GraduateOutstandingBalance,
      Payment,
    ]),
    SettingsModule,
    LogsModule,
    AuthModule,
    ConfigModule,
  ],
  controllers: [
    FinanceController, 
    EnhancedFinanceController,
    ReceiptController,
    GraduateFeesController,
  ],
  providers: [
    // Existing services
    FinanceService, 
    StudentFeeExpectationService, 
    FeeAnalyticsService,
    // Enhanced services
    EnhancedFinanceService,
    PaymentAllocationService,
    CarryForwardService,
    GraduateFeesService,
  ],
  exports: [
    FinanceService,
    FeeAnalyticsService, // Add this to export the service
    StudentFeeExpectationService, // Also export if needed by other modules
  ],
})
export class FinanceModule {}