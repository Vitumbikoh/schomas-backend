import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { School } from '../../school/entities/school.entity';
import { Term } from '../../settings/entities/term.entity';
import { User } from '../../user/entities/user.entity';

export interface TermBreakdown {
  termId: string;
  termNumber: number;
  academicYear: string;
  expected: number;
  paid: number;
  outstanding: number;
}

@Entity('graduate_outstanding_balance')
@Index(['studentId'])
@Index(['schoolId'])
@Index(['paymentStatus'])
@Index(['outstandingAmount'])
export class GraduateOutstandingBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relationships
  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { eager: true })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School)
  @JoinColumn({ name: 'school_id' })
  school: School;

  // Financial snapshot at graduation
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalExpected: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalPaid: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  outstandingAmount: number;

  // Term breakdown (JSONB)
  @Column({ type: 'jsonb', nullable: true })
  termBreakdown: TermBreakdown[];

  // Status tracking
  @Column({ type: 'varchar', length: 50, default: 'outstanding' })
  paymentStatus: 'outstanding' | 'partial' | 'paid' | 'waived';

  @Column({ type: 'timestamp', nullable: true })
  lastPaymentDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  lastPaymentAmount: number;

  // Graduation details
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  graduatedAt: Date;

  @Column({ name: 'graduation_term_id', type: 'uuid', nullable: true })
  graduationTermId: string;

  @ManyToOne(() => Term, { nullable: true })
  @JoinColumn({ name: 'graduation_term_id' })
  graduationTerm: Term;

  @Column({ type: 'varchar', length: 100, nullable: true })
  graduationClass: string;

  // Notes and history
  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  paymentPlan: string; // 'installment', 'cleared', 'negotiated', 'none'

  // Audit
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
