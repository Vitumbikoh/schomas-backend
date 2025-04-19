import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { Finance } from '../user/entities/finance.entity';
import { FeePayment } from './entities/fee-payment.entity';
import { Budget } from './entities/budget.entity';
import { Student } from '../user/entities/student.entity';
import { User } from '../user/entities/user.entity';
import { Department } from './entities/department.entity';
import { ReceiptController } from './receipt.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Finance,
      FeePayment,
      Budget,
      Student,
      User,
      Department,
    ]),
  ],
  controllers: [FinanceController, ReceiptController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}