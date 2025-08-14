import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Course } from '../../course/entities/course.entity';
import { Class } from '../../classes/entity/class.entity';
import { Exam } from 'src/exams/entities/exam.entity';
import { Student } from 'src/user/entities/student.entity';
import { Teacher } from 'src/user/entities/teacher.entity';

@Entity()
export class Grade {
  @PrimaryGeneratedColumn('uuid')
  gradeId: string;

  @Column()
  grade: string;

  @Column()
  assessmentType: string;

  @ManyToOne(() => Student, (student) => student.grades)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  // Relationship to Teacher profile
  @ManyToOne(() => Teacher)
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @ManyToOne(() => Course)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => Class)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @CreateDateColumn()
  date: Date;

  @ManyToOne(() => Exam)
  @JoinColumn({ name: 'examId' })
  exam: Exam;
}