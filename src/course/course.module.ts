import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './entities/course.entity';
import { CourseService } from './course.service';
import { Teacher } from 'src/user/entities/teacher.entity';
import { UsersModule } from 'src/user/users.module';
import { CourseController } from './course.controller';
import { TeachersModule } from 'src/teacher/teacher.module';
import { EnrollmentModule } from 'src/enrollment/enrollment.module';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { StudentsModule } from 'src/student/student.module';
import { Student } from 'src/user/entities/student.entity';
import { Class } from 'src/classes/entity/class.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Teacher, Enrollment, Student, Class]), 
    UsersModule,
    TeachersModule,
    EnrollmentModule,
    StudentsModule,
  ],
  controllers: [CourseController], 
  providers: [CourseService],
  exports: [CourseService, TypeOrmModule],
})
export class CourseModule {}