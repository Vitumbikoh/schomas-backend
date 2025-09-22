import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { SalaryRun } from './entities/salary-run.entity';
import { SalaryItem } from './entities/salary-item.entity';
import { PayrollApprovalHistory } from './entities/payroll-approval-history.entity';
import { PayComponent } from './entities/pay-component.entity';
import { StaffPayAssignment } from './entities/staff-pay-assignment.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { User } from '../user/entities/user.entity';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalaryRun, SalaryItem, PayrollApprovalHistory, PayComponent, StaffPayAssignment, Expense, User]),
    LogsModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
