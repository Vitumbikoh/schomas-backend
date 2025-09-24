import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradeService } from './grade.service';
import { Grade } from './entity/grade.entity';
import { GradeFormat } from './entity/grade-format.entity';
import { User } from '../user/entities/user.entity';
import { Course } from '../course/entities/course.entity';
import { Class } from '../classes/entity/class.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Term } from 'src/settings/entities/term.entity';
import { AcademicCalendar } from 'src/settings/entities/academic-calendar.entity';
import { AuthModule } from '../auth/auth.module';
import { GradeController } from './grade.controller';
import { ConfigModule } from 'src/config/config.module';
import { Exam } from '../exams/entities/exam.entity';
import { AggregationModule } from '../aggregation/aggregation.module';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { ExamGradeRecord } from '../aggregation/aggregation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
  Grade,
  GradeFormat,
      User,
      Course,
      Class,
      Student,
      Teacher,
      Term,
      AcademicCalendar,
      Exam,
      ExamResultAggregate,
      ExamGradeRecord,
    ]),
    AuthModule,
    ConfigModule,
    AggregationModule,
  ],
  controllers: [GradeController], // Now properly imported
  providers: [GradeService],
  exports: [GradeService],
})
export class GradeModule {}