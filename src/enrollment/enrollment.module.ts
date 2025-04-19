// src/enrollment/enrollment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { EnrollmentService } from './enrollment.service';
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Enrollment, Course, Student])],
  providers: [EnrollmentService],
  exports: [EnrollmentService, TypeOrmModule], 
})
export class EnrollmentModule {}