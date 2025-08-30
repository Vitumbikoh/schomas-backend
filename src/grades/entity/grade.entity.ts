import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Course } from '../../course/entities/course.entity';
import { Class } from '../../classes/entity/class.entity';
import { Exam } from 'src/exams/entities/exam.entity';
import { Student } from 'src/user/entities/student.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { School } from 'src/school/entities/school.entity';
import { Term } from 'src/settings/entities/term.entity';

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

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  // Term tracking
  @Column({ type: 'uuid', nullable: true })
  termId: string;
  
  @ManyToOne(() => Term, (term) => term.id, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'termId' })
  term: Term;
}