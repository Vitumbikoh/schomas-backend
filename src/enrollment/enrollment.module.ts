// src/enrollment/enrollment.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { EnrollmentService } from './enrollment.service';
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';
import { EnrollmentController } from './enrollment.controller';
import { LogsModule } from 'src/logs/logs.module';
import { SettingsModule } from 'src/settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Enrollment, Course, Student]),
 forwardRef(() => SettingsModule), LogsModule],
  providers: [EnrollmentService],
  controllers: [EnrollmentController],
  exports: [EnrollmentService, TypeOrmModule], // This exports the EnrollmentRepository
})
export class EnrollmentModule {}