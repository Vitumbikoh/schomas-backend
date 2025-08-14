// src/enrollment/entities/enrollment.entity.ts
import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column, CreateDateColumn } from 'typeorm';
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';
import { AcademicYear } from 'src/settings/entities/academic-year.entity';

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

 @Column({ type: 'uuid' })
  academicYearId: string; // Add this line
  
  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academicYearId' })
  academicYear: AcademicYear; // Add this relationship
}