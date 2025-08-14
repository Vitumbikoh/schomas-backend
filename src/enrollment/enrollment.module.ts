// src/enrollment/enrollment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { EnrollmentService } from './enrollment.service';
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';
import { EnrollmentController } from './enrollment.controller';
import { LogsService } from 'src/logs/logs.service';
import { Log } from 'src/logs/logs.entity';
import { SettingsModule } from 'src/settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Enrollment, Course, Student, Log]),
 SettingsModule,],
  providers: [EnrollmentService, LogsService],
  controllers: [EnrollmentController],
  exports: [EnrollmentService, TypeOrmModule], // This exports the EnrollmentRepository
})
export class EnrollmentModule {}