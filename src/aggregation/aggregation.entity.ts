import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Course } from '../course/entities/course.entity';
import { Term } from '../settings/entities/term.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Student } from '../user/entities/student.entity';
import { School } from '../school/entities/school.entity';

export enum AggregatedResultStatus { PENDING='PENDING', COMPLETE='COMPLETE' }
export enum AssessmentComponentType { MID_TERM='midterm', END_TERM='endterm', ASSIGNMENT='assignment', QUIZ='quiz', PRACTICAL='practical', PROJECT='project' }

@Entity('course_term_grade_scheme')
@Unique(['courseId','termId'])
export class CourseTermGradeScheme {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'uuid' }) courseId: string;
  @ManyToOne(()=>Course,{ onDelete:'CASCADE'}) @JoinColumn({name:'courseId'}) course: Course;
  @Column({ type:'uuid' }) termId: string;
  @ManyToOne(()=>Term,{ onDelete:'CASCADE'}) @JoinColumn({name:'termId'}) term: Term;
  @Column({ type:'uuid', nullable:true }) teacherId: string | null; // last editor
  @ManyToOne(()=>Teacher,{ onDelete:'SET NULL'}) @JoinColumn({name:'teacherId'}) teacher: Teacher;
  @Column({ type:'uuid', nullable:true }) schoolId: string | null;
  @ManyToOne(()=>School,{ onDelete:'CASCADE'}) @JoinColumn({name:'schoolId'}) school: School;
  @OneToMany(()=>CourseTermGradeComponent,c=>c.scheme,{ cascade:true, eager:true }) components: CourseTermGradeComponent[];
  @Column({ type:'int', default:0 }) totalWeight: number;
  @Column({ type:'int', nullable:true }) passThreshold: number | null; // percentage based
  @Column({ default:false }) isLocked: boolean;
  @Column({ type:'int', default:1 }) version: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('course_term_grade_component')
@Unique(['schemeId','componentType'])
export class CourseTermGradeComponent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type:'uuid' }) schemeId: string;
  @ManyToOne(()=>CourseTermGradeScheme, s=>s.components, { onDelete:'CASCADE'}) @JoinColumn({name:'schemeId'}) scheme: CourseTermGradeScheme;
  @Column({ type:'enum', enum: AssessmentComponentType }) componentType: AssessmentComponentType;
  @Column({ type:'int' }) weight: number; // must sum to 100 in scheme
  @Column({ type:'boolean', default:true }) required: boolean;
}

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
  @Column({ type:'decimal', precision:7, scale:2 }) rawScore: string; // store as string for precision
  @Column({ type:'decimal', precision:5, scale:2 }) percentage: string;
  @Column({ type:'enum', enum:['DRAFT','PUBLISHED'], default:'PUBLISHED' }) status: 'DRAFT' | 'PUBLISHED';
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

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