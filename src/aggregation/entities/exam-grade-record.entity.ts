import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Exam } from '../../exams/entities/exam.entity';
import { Student } from '../../user/entities/student.entity';
import { Course } from '../../course/entities/course.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from '../../school/entities/school.entity';

@Entity('exam_grade')
@Unique(['examId','studentId'])
export class ExamGradeRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'uuid' }) examId: string;
  @ManyToOne(()=>Exam,{ onDelete:'CASCADE'}) @JoinColumn({name:'examId'}) exam: Exam;
  @Column({ type:'uuid' }) studentId: string;
  @ManyToOne(()=>Student,{ onDelete:'CASCADE'}) @JoinColumn({name:'studentId'}) student: Student;
  @Column({ type:'uuid' }) courseId: string;
  @ManyToOne(()=>Course,{ onDelete:'CASCADE'}) @JoinColumn({name:'courseId'}) course: Course;
  @Column({ type:'uuid' }) termId: string;
  @ManyToOne(()=>Term,{ onDelete:'CASCADE'}) @JoinColumn({name:'termId'}) term: Term;
  @Column({ type:'uuid', nullable:true }) schoolId: string | null;
  @ManyToOne(()=>School,{ onDelete:'CASCADE'}) @JoinColumn({name:'schoolId'}) school: School;
  @Column({ type:'decimal', precision:7, scale:2 }) rawScore: string; // store as string for precision; convert in service
  @Column({ type:'decimal', precision:5, scale:2 }) percentage: string;
  @Column({ type:'enum', enum:['DRAFT','PUBLISHED'], default:'PUBLISHED' }) status: 'DRAFT' | 'PUBLISHED';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
