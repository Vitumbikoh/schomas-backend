// src/exam/entities/exam.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
  } from 'typeorm';
  import { Course } from '../../course/entities/course.entity';
  import { Teacher } from '../../user/entities/teacher.entity';
import { Question } from './question.entity';
import { ExamAttempt } from './exam-attempt.entity';
  
  @Entity()
  export class Exam {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column()
    title: string;
  
    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
      type: 'enum',
      enum: ['draft', 'published', 'completed', 'upcoming'],
      default: 'draft'
    })
    status: 'draft' | 'published' | 'completed' | 'upcoming';
  
    @Column({ type: 'timestamp' })
    startTime: Date;
  
    @Column({ type: 'timestamp' })
    endTime: Date;
  
    @Column({ type: 'integer', default: 0 })
    duration: number; // in minutes
  
    @Column({ default: false })
    isPublished: boolean;
  
    @Column({ default: 100 })
    totalMarks: number;
  
    @Column({ default: 50 })
    passingMarks: number;
  
    @Column({ type: 'jsonb', nullable: true })
    instructions: string[];
  
    @ManyToOne(() => Course, (course) => course.exams)
    @JoinColumn({ name: 'courseId' })
    course: Course;
  
    @Column({ type: 'uuid' })
    courseId: string;
  
    @ManyToOne(() => Teacher, (teacher) => teacher.exams)
    @JoinColumn({ name: 'teacherId' })
    teacher: Teacher;
  
    @Column({ type: 'uuid' })
    teacherId: string;
  
    @OneToMany(() => Question, (question) => question.exam)
    questions: Question[];
  
    @OneToMany(() => ExamAttempt, (attempt) => attempt.exam)
    attempts: ExamAttempt[];
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  }