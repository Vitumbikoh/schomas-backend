import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { Course } from '../../course/entities/course.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from '../../school/entities/school.entity';
import { AggregatedResultStatus } from '../enums';

@Entity('exam_result')
@Unique(['studentId','courseId','termId'])
export class ExamResultAggregate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'uuid' }) studentId: string;
  @ManyToOne(()=>Student,{ onDelete:'CASCADE'}) @JoinColumn({name:'studentId'}) student: Student;
  @Column({ type:'uuid' }) courseId: string;
  @ManyToOne(()=>Course,{ onDelete:'CASCADE'}) @JoinColumn({name:'courseId'}) course: Course;
  @Column({ type:'uuid' }) termId: string;
  @ManyToOne(()=>Term,{ onDelete:'CASCADE'}) @JoinColumn({name:'termId'}) term: Term;
  @Column({ type:'uuid', nullable:true }) schoolId: string | null;
  @ManyToOne(()=>School,{ onDelete:'CASCADE'}) @JoinColumn({name:'schoolId'}) school: School;
  @Column({ type:'decimal', precision:5, scale:2, nullable:true }) finalPercentage: string | null;
  @Column({ type:'varchar', length:4, nullable:true }) finalGradeCode: string | null;
  @Column({ type:'boolean', nullable:true }) pass: boolean | null;
  @Column({ type:'jsonb', nullable:true }) breakdown: any;
  @Column({ type:'int', default:1 }) schemeVersion: number;
  @Column({ type:'enum', enum: AggregatedResultStatus, default: AggregatedResultStatus.PENDING }) status: AggregatedResultStatus;
  @Column({ type:'timestamptz', nullable:true }) computedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
