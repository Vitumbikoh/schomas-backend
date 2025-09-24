import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamResultController } from './exam-result.controller';
import { ExamResultService } from './exam-result.service';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { Student } from '../user/entities/student.entity';
import { Class } from '../classes/entity/class.entity';
import { Course } from '../course/entities/course.entity';
import { User } from '../user/entities/user.entity';
import { Term } from '../settings/entities/term.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExamResultAggregate,
      Student,
      Class,
      Course,
      User,
      Term,
    ]),
  ],
  controllers: [ExamResultController],
  providers: [ExamResultService],
  exports: [ExamResultService],
})
export class ExamResultModule {}