// src/enrollment/entities/enrollment.entity.ts
import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column, CreateDateColumn } from 'typeorm';
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';

@Entity()
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  courseId: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ type: 'date', nullable: true })
  enrollmentDate: Date;

  @Column({ default: 'active' })
  status: 'active' | 'completed' | 'dropped';

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Course, course => course.enrollments)
course: Course;

@ManyToOne(() => Student, student => student.enrollments)
student: Student;
  
}