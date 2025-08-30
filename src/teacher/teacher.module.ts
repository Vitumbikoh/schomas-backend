import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../user/users.module';
import { TeachersService } from './teacher.service';
import { User } from '../user/entities/user.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { ConfigModule } from 'src/config/config.module';
import { TeacherController } from './teacher.controller';
import { UsersService } from 'src/user/user.service';
import { CourseService } from 'src/course/course.service';
import { Course } from 'src/course/entities/course.entity';
import { ClassService } from 'src/classes/class.service';
import { Class } from 'src/classes/entity/class.entity';
import { Schedule } from 'src/schedule/entity/schedule.entity';
import { ScheduleService } from 'src/schedule/schedule.service';
import { ClassroomService } from 'src/classroom/classroom.service';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { Attendance } from 'src/attendance/entity/attendance.entity';
import { ExamService } from 'src/exams/exam.service';
import { SettingsService } from 'src/settings/settings.service';
import { Exam } from 'src/exams/entities/exam.entity';
import { Term } from 'src/settings/entities/term.entity';
import { SettingsModule } from 'src/settings/settings.module';
import { ExamModule } from 'src/exams/exam.module';
import { Grade } from 'src/grades/entity/grade.entity';
import { LogsModule } from 'src/logs/logs.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Teacher, User, Course, Class, Schedule, Classroom,Attendance, Grade, Exam, Term]),
    UsersModule,
    AuthModule,
    SettingsModule,
    ExamModule,
    LogsModule,
  ],
  providers: [
    TeachersService,
    UsersService,
    CourseService,
    ClassService,
    ScheduleService,
    ClassroomService,
   
    ExamService,
  ],
  controllers: [TeacherController],
  exports: [TeachersService],
})
export class TeachersModule {}