import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn, Index, Check } from 'typeorm';
import { AcademicCalendar } from '../../settings/entities/academic-calendar.entity';
import { Term } from '../../settings/entities/term.entity';
import { Class } from '../../classes/entity/class.entity';
import { School } from '../../school/entities/school.entity';
import { User } from '../../user/entities/user.entity';

export enum FeeCategory {
  TUITION = 'tuition',
  BOARDING = 'boarding',
  UNIFORM = 'uniform',
  BOOKS = 'books',
  TRANSPORT = 'transport',
  ACTIVITIES = 'activities',
  TECHNOLOGY = 'technology',
  EXAMINATION = 'examination',
  CARRY_FORWARD = 'carry_forward',  // Outstanding balance from previous term
  OTHER = 'other'
}

/**
 * Expected fees for a specific academic term and class.
 * Includes both current term fees and any carried-forward balances.
 */
@Entity('expected_fees')
@Index('idx_expected_fee_lookup', ['academicCalendarId', 'termId', 'classId'])
@Index('idx_fee_category', ['academicCalendarId', 'termId', 'feeCategory'])
@Check('positive_amount', 'amount > 0')
export class ExpectedFee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multi-tenancy
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  // Academic context
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

  @Column({ type: 'uuid', nullable: true })
  classId: string;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'classId' })
  class: Class;

  // Fee details
  @Column({
    type: 'enum',
    enum: FeeCategory
  })
  feeCategory: FeeCategory;

  @Column({ length: 200 })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ default: false })
  isOptional: boolean;

  @Column({ default: true })
  isActive: boolean;

  // Carry-forward specific fields
  @Column({ type: 'uuid', nullable: true })
  originalTermId: string; // For carry-forward fees, reference to original term

  @ManyToOne(() => Term, { nullable: true })
  @JoinColumn({ name: 'originalTermId' })
  originalTerm: Term;

  @Column({ type: 'text', nullable: true })
  carryForwardReason: string;

  // Frequency and applicability
  @Column({ 
    type: 'enum', 
    enum: ['once', 'monthly', 'termly', 'annually'],
    default: 'termly'
  })
  frequency: string;

  @Column({ type: 'int', default: 1 })
  applicableInstances: number; // How many times this fee applies in the term

  // Audit trail
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: User;

  // System flags
  @Column({ default: false })
  isCarryForward: boolean;

  @Column({ default: true })
  isSystemGenerated: boolean;
}