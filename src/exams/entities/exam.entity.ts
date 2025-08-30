// src/exams/entities/exam.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Class } from '../../classes/entity/class.entity';
import { Teacher } from '../../user/entities/teacher.entity';
import { Course } from '../../course/entities/course.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from 'src/school/entities/school.entity';

@Entity()
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  title: string;

  @Column({ nullable: false })
  subject: string;

  @ManyToOne(() => Class)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @ManyToOne(() => Teacher)
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @Column({ type: 'date', nullable: false })
  date: string;

  @Column({ nullable: false })
  duration: string;

  @Column({ type: 'uuid' })
  TermId: string;

  @Column({ type: 'integer', nullable: false })
  totalMarks: number;

  @Column({
    type: 'enum',
    enum: ['upcoming', 'administered', 'graded'],
    default: 'upcoming',
  })
  status: 'upcoming' | 'administered' | 'graded';

  @Column({ type: 'integer', default: 0 })
  studentsEnrolled: number;

  @Column({ type: 'integer', default: 0 })
  studentsCompleted: number;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column({ nullable: true })
  examType: string;

  @ManyToOne(() => Course)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => Term)
  @JoinColumn({ name: 'TermId' })
  Term: Term;

    // Multi-tenant scope
    @Column({ type: 'uuid', nullable: true })
    schoolId?: string | null;

    @ManyToOne(() => School, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'schoolId' })
    school?: School | null;
}
