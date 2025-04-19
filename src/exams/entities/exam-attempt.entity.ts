// src/exam/entities/exam-attempt.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
  } from 'typeorm';
  import { Exam } from './exam.entity';
  import { Student } from '../../user/entities/student.entity';
  
  @Entity()
  export class ExamAttempt {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    startedAt: Date;
  
    @Column({ type: 'timestamp', nullable: true })
    submittedAt: Date;
  
    @Column({ type: 'jsonb' })
    answers: Record<string, number>; // questionId -> selectedOptionIndex
  
    @Column({ type: 'integer', nullable: true })
    score: number;
  
    @Column({ default: false })
    isPassed: boolean;
  
    @ManyToOne(() => Exam, (exam) => exam.attempts)
    @JoinColumn({ name: 'examId' })
    exam: Exam;
  
    @Column({ type: 'uuid' })
    examId: string;
  
    @ManyToOne(() => Student, (student) => student.examAttempts)
    @JoinColumn({ name: 'studentId' })
    student: Student;
  
    @Column({ type: 'uuid' })
    studentId: string;
  }