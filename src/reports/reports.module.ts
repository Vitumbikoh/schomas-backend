import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { StudentsService } from '../student/student.service';
import { TeachersService } from '../teacher/teacher.service';
import { CourseService } from '../course/course.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../course/entities/course.entity';
import { Enrollment } from '../enrollment/entities/enrollment.entity';
import { Student } from 'src/user/entities/student.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { User } from 'src/user/entities/user.entity'; // Add this import
import { UsersService } from 'src/user/user.service';
import { ScheduleService } from 'src/schedule/schedule.service';
import { ParentsService } from 'src/parent/parents.service';
import { Schedule } from 'src/schedule/entity/schedule.entity';
import { Parent } from 'src/user/entities/parent.entity';
import { Class } from 'src/classes/entity/class.entity';
import { Attendance } from 'src/attendance/entity/attendance.entity';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { SettingsModule } from 'src/settings/settings.module';
import { ExamService } from 'src/exams/exam.service';
import { Exam } from 'src/exams/entities/exam.entity';
import { TeachersModule } from 'src/teacher/teacher.module';
import { FinanceModule } from 'src/finance/finance.module';
import { LogsModule } from 'src/logs/logs.module';
import { AggregationModule } from 'src/aggregation/aggregation.module';
import { ReportsMapperService } from './reports-mapper.service';
import { LibraryModule } from '../library/library.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Student, 
      Class,
      Teacher, 
      Course, 
      Enrollment, 
      Schedule, 
      Parent,
      User,
      Attendance,
      Schedule,
      Classroom,
  Exam
    ]),
    SettingsModule,
    TeachersModule,
    FinanceModule,
  LogsModule,
  AggregationModule,
  LibraryModule
  ],
  controllers: [ReportsController],
  providers: [
    StudentsService,
    TeachersService,
    CourseService,
    EnrollmentService,
    UsersService,
    ScheduleService,
    ParentsService,
    ExamService,
    ReportsMapperService
  ],
})
export class ReportsModule {}