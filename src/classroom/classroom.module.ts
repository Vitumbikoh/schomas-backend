// classroom.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Classroom } from './entity/classroom.entity';
import { ClassroomService } from './classroom.service';
import { ClassroomController } from './classroom.controller';
import { ScheduleModule } from '../schedule/schedule.module'; 
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from 'src/config/config.module';
import { LogsModule } from 'src/logs/logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Classroom]),
    ScheduleModule, AuthModule, ConfigModule, LogsModule
  ],
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}