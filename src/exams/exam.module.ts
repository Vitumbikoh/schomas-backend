// src/exam/exam.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';
import { Exam } from './entities/exam.entity';
import { Question } from './entities/question.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { CourseModule } from '../course/course.module';
import { TeachersModule } from 'src/teacher/teacher.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Exam, Question, ExamAttempt]),
    CourseModule,
    TeachersModule,
  ],
  controllers: [ExamController],
  providers: [ExamService],
  exports: [ExamService],
})
export class ExamModule {}