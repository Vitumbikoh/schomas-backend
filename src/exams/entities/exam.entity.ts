import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { Course } from '../../course/entities/course.entity';

@Entity()
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  subject: string;

  @Column()
  class: string;

  @Column()
  teacher: string;

  @Column()
  date: string;

  @Column()
  duration: string;

  @Column()
  totalMarks: number;

  @Column()
  status: 'upcoming' | 'administered' | 'graded';

  @Column()
  studentsEnrolled: number;

  @Column()
  studentsCompleted: number;

  @Column()
  academicYear: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  instructions: string;

  @Column()
  courseId: string;

  @ManyToOne(() => Course, (course) => course.exams)
  course: Course;
}