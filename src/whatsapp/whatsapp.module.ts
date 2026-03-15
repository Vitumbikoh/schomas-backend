import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../config/config.module';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppMessageLog } from './entities/whatsapp-message-log.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { FeeStructure } from '../finance/entities/fee-structure.entity';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { Attendance } from '../attendance/entity/attendance.entity';
import { Schedule } from '../schedule/entity/schedule.entity';
import { Term } from '../settings/entities/term.entity';
import { Notification } from '../notifications/entities/notification.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Student,
      Parent,
      WhatsAppMessageLog,
      FeePayment,
      FeeStructure,
      ExamResultAggregate,
      Attendance,
      Schedule,
      Term,
      Notification,
    ]),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
