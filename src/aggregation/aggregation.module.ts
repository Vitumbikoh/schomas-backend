import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AggregationService } from './aggregation.service';
import { AggregationController } from './aggregation.controller';
import { CourseTermGradeScheme, CourseTermGradeComponent, ExamGradeRecord, ExamResultAggregate, DefaultWeightingScheme, DefaultWeightingComponent } from './aggregation.entity';
import { GradeFormat } from '../grades/entity/grade-format.entity';
import { Course } from '../course/entities/course.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Student } from '../user/entities/student.entity';
import { Term } from '../settings/entities/term.entity';
import { Teacher } from '../user/entities/teacher.entity';

@Module({
  imports:[TypeOrmModule.forFeature([CourseTermGradeScheme, CourseTermGradeComponent, ExamGradeRecord, ExamResultAggregate, DefaultWeightingScheme, DefaultWeightingComponent, GradeFormat, Course, Exam, Student, Term, Teacher])],
  controllers:[AggregationController],
  providers:[AggregationService],
  exports:[AggregationService]
})
export class AggregationModule {}
