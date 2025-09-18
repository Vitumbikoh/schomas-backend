import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { User } from '../user/entities/user.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Finance } from '../user/entities/finance.entity';
import { UsersModule } from '../user/users.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Teacher, Finance]),
    UsersModule,
    LogsModule,
  ],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}