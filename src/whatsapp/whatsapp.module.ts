import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../config/config.module';
import { User } from '../user/entities/user.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Finance } from '../user/entities/finance.entity';
import { Attendance } from '../attendance/entity/attendance.entity';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { FeeStructure } from '../finance/entities/fee-structure.entity';
import { ExpectedFee } from '../finance/entities/expected-fee.entity';
import { Term } from '../settings/entities/term.entity';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      User,
      Student,
      Parent,
      Teacher,
      Finance,
      Attendance,
      ExamResultAggregate,
      Notification,
      FeePayment,
      FeeStructure,
      ExpectedFee,
      Term,
    ]),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
