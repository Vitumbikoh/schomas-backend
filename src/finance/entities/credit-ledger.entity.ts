import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { FeePayment } from './fee-payment.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from 'src/school/entities/school.entity';

@Entity()
export class CreditLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { nullable: false })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid', nullable: true })
  termId: string | null;

  @ManyToOne(() => Term, { nullable: true })
  @JoinColumn({ name: 'termId' })
  term?: Term | null;

  @ManyToOne(() => FeePayment, { nullable: true })
  @JoinColumn({ name: 'sourcePaymentId' })
  sourcePayment?: FeePayment | null;

  // Total credited amount (surplus captured)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  // Remaining amount available to apply
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  remainingAmount: number;

  @Column({ type: 'enum', enum: ['active', 'applied', 'refunded'], default: 'active' })
  status: 'active' | 'applied' | 'refunded';

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school?: School | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
