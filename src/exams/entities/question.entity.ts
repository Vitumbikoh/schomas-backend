// src/exam/entities/question.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
  } from 'typeorm';
  import { Exam } from './exam.entity';
  
  @Entity()
  export class Question {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ type: 'text' })
    text: string;
  
    @Column({ type: 'jsonb' })
    options: string[];
  
    @Column()
    correctAnswer: number; // index of correct answer in options array
  
    @Column({ type: 'integer' })
    marks: number;
  
    @ManyToOne(() => Exam, (exam) => exam.questions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'examId' })
    exam: Exam;
  
    @Column({ type: 'uuid' })
    examId: string;
  }