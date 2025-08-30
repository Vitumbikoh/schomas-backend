import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamService } from './exam.service';
import { ExamController } from './exam.controller';
import { Exam } from './entities/exam.entity';
import { Class } from '../classes/entity/class.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Course } from '../course/entities/course.entity';
import { Term } from '../settings/entities/term.entity';
import { CourseModule } from '../course/course.module';
import { ClassModule } from '../classes/class.module';
import { UsersModule } from '../user/users.module';
import { SettingsModule } from '../settings/settings.module';
import { TeachersModule } from 'src/teacher/teacher.module';
import { LogsModule } from '../logs/logs.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Exam, Class, Teacher, Course, Term]),
    forwardRef(() => ClassModule),
    forwardRef(() => UsersModule),
    forwardRef(() => CourseModule),
    forwardRef(() => SettingsModule),
    TypeOrmModule.forFeature([Exam]), 
    forwardRef(() => TeachersModule),
    LogsModule,
    AuthModule,
    ConfigModule,
  ],
  controllers: [ExamController],
  providers: [ExamService],
  exports: [ExamService],
})
export class ExamModule {}