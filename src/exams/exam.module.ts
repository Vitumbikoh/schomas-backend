import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamService } from './exam.service';
import { ExamController } from './exam.controller';
import { Exam } from './entities/exam.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Exam])],
  providers: [ExamService],
  controllers: [ExamController],
})
export class ExamModule {}