import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from '../../school/entities/school.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Dedicated table that traps every cash collection event.
 * One row = one payment session (regardless of how the money was later allocated).
 * This gives a clean "cashbook" view of money physically received per term.
 *
 * See also: FeePayment (internal allocation splits) and PaymentAllocation (where money was applied).
 */
@Entity('payments')
@Index('idx_payments_term_school', ['termId', 'schoolId'])
@Index('idx_payments_student_term', ['studentId', 'termId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Total cash amount received in this payment session */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', nullable: true })
  receiptNumber: string | null;

  @Column({
    type: 'enum',
    enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'],
    default: 'cash',
  })
  paymentMethod: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';

  @Column({ type: 'enum', enum: ['MWK', 'USD'], default: 'MWK' })
  currency: 'MWK' | 'USD';

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
  })
  status: 'pending' | 'completed' | 'failed' | 'cancelled';

  /** Date cash was physically collected */
  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  /** Term in which this cash was collected (NOT necessarily where it was allocated) */
  @Column({ type: 'uuid' })
  termId: string;

  @ManyToOne(() => Term)
  @JoinColumn({ name: 'termId' })
  term: Term;

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @ManyToOne(() => School, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School | null;

  /** Finance officer or admin who recorded this payment */
  @Column({ type: 'uuid', nullable: true })
  recordedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recordedById' })
  recordedBy: User | null;

  /**
   * Comma-separated list (or JSON array) of FeePayment IDs that make up this
   * payment session.  Preserved for backward-compatibility with existing data.
   */
  @Column({ type: 'text', nullable: true })
  feePaymentIds: string | null;

  /**
   * Canonical reference to the primary FeePayment record for traceability.
   * Added alongside feePaymentIds so new payments can use a typed UUID.
   */
  @Column({ type: 'uuid', nullable: true })
  feePaymentId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

