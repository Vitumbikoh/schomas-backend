import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SchoolBillingPlan } from './entities/school-billing-plan.entity';
import { BillingInvoice } from './entities/billing-invoice.entity';
import { BillingPayment } from './entities/billing-payment.entity';
import { Term } from '../settings/entities/term.entity';
import { AcademicCalendar } from '../settings/entities/academic-calendar.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { School } from '../school/entities/school.entity';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
  TypeOrmModule.forFeature([SchoolBillingPlan, BillingInvoice, BillingPayment, Term, AcademicCalendar, Enrollment, School]),
  AuthModule,
  ConfigModule,
  NotificationModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
