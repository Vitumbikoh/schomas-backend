import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './entity/schedule.entity';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { CourseModule } from 'src/course/course.module';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, Course, Teacher, Classroom]),
    CourseModule,
    AuthModule,
    ConfigModule, // ✅ Add this line
  ],
  providers: [ScheduleService],
  controllers: [ScheduleController],
  exports: [ScheduleService, TypeOrmModule],
})
export class ScheduleModule {}
