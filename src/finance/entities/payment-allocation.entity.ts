import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn, Index, Check } from 'typeorm';
import { FeePayment } from './fee-payment.entity';
import { AcademicCalendar } from '../../settings/entities/academic-calendar.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from '../../school/entities/school.entity';
import { User } from '../../user/entities/user.entity';

export enum AllocationReason {
  TERM_FEES = 'term_fees',           // Payment for current term fees
  HISTORICAL_SETTLEMENT = 'historical_settlement', // Settling old outstanding balances
  ADVANCE_PAYMENT = 'advance_payment',       // Payment for future terms
  CARRY_FORWARD_SETTLEMENT = 'carry_forward_settlement' // Settling carried forward balances
}

/**
 * Explicit allocation of payment amounts to specific academic terms.
 * This entity ensures we know exactly which term a payment portion applies to.
 */
@Entity('payment_allocations')
@Index('idx_payment_term', ['paymentId', 'termId'])
@Index('idx_allocation_lookup', ['academicCalendarId', 'termId', 'allocationReason'])
@Check('positive_amount', '"allocatedAmount" > 0')
export class PaymentAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multi-tenancy
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  // Payment reference
  @Column({ type: 'uuid' })
  paymentId: string;

  @ManyToOne(() => FeePayment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment: FeePayment;

  // Academic term this allocation applies to
  @Column({ type: 'uuid' })
  academicCalendarId: string;

  @ManyToOne(() => AcademicCalendar, { eager: true })
  @JoinColumn({ name: 'academicCalendarId' })
  academicCalendar: AcademicCalendar;

  @Column({ type: 'uuid' })
  termId: string;

  @ManyToOne(() => Term, { eager: true })
  @JoinColumn({ name: 'termId' })
  term: Term;

  // Allocation details
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  allocatedAmount: number;

  @Column({
    type: 'enum',
    enum: AllocationReason,
    default: AllocationReason.TERM_FEES
  })
  allocationReason: AllocationReason;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Audit trail
  @CreateDateColumn()
  allocatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  allocatedByUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'allocatedByUserId' })
  allocatedBy: User;

  // Flag for system-generated vs manual allocations
  @Column({ default: true })
  isAutoAllocation: boolean;
}