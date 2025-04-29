import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { StudentDashboardController } from './student-dashboard.controller';
import { StudentsModule } from 'src/student/student.module';
import { CourseModule } from 'src/course/course.module';
import { TeachersModule } from 'src/teacher/teacher.module';
import { Teacher } from 'src/user/entities/teacher.entity';
import { EnrollmentModule } from 'src/enrollment/enrollment.module';
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Teacher, Course, Student]), // Add this line
    StudentsModule, 
    CourseModule, 
    TeachersModule,
    EnrollmentModule
  ],
  controllers: [
    DashboardController,
    AdminDashboardController,
    StudentDashboardController,
  ],
  
})
export class DashboardModule {}