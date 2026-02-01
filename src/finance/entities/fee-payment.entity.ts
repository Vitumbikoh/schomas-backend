import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToMany } from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { Finance } from '../../user/entities/finance.entity';
import { User } from '../../user/entities/user.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from 'src/school/entities/school.entity';
import { PaymentAllocation } from './payment-allocation.entity';

@Entity()
export class FeePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', nullable: true })
  receiptNumber: string | null;

  @Column({ type: 'enum', enum: ['MWK', 'USD'], default: 'MWK' })
  currency: 'MWK' | 'USD';

  @Column()
  paymentType: string;

  @Column({ type: 'enum', enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'], default: 'cash' })
  paymentMethod: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'completed' })
  status: 'pending' | 'completed' | 'failed' | 'cancelled';

  @Column()
  paymentDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid' })
  studentId: string;

  // Payment term (term when payment was made) - for historical tracking
  @Column({ type: 'uuid' })
  termId: string;

  @ManyToOne(() => Term)
  @JoinColumn({ name: 'termId' })
  term: Term;

  @ManyToOne(() => Finance, { nullable: true })
  @JoinColumn({ name: 'processedById' })
  processedBy?: Finance;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processedByAdminId' })
  processedByAdmin?: User;

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  // Payment allocations - explicit term assignments
  @OneToMany(() => PaymentAllocation, allocation => allocation.payment, { cascade: true })
  allocations: PaymentAllocation[];

  // Allocation status tracking
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAllocated: number;

  @Column({ default: false })
  isFullyAllocated: boolean;

  // Auto-allocation preferences (for system convenience)
  @Column({ default: true })
  autoAllocateToCurrentTerm: boolean;
}
