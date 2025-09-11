import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { School } from '../../school/entities/school.entity';
import { Term } from '../../settings/entities/term.entity';
import { AcademicCalendar } from '../../settings/entities/academic-calendar.entity';

@Entity('billing_invoice')
export class BillingInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  invoiceNumber: string; // e.g., SCH-2025T1-0001

  @Column({ type: 'uuid' })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'uuid', nullable: true })
  termId?: string | null;
  @ManyToOne(() => Term, { nullable: true })
  @JoinColumn({ name: 'termId' })
  term?: Term | null;

  @Column({ type: 'uuid', nullable: true })
  academicCalendarId?: string | null;
  @ManyToOne(() => AcademicCalendar, { nullable: true })
  @JoinColumn({ name: 'academicCalendarId' })
  academicCalendar?: AcademicCalendar | null;

  // Snapshot of pricing and usage at time of issuance
  @Column({ type: 'int' })
  activeStudentsCount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  ratePerStudent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'enum', enum: ['draft', 'issued', 'paid', 'partial', 'overdue', 'void'], default: 'issued' })
  status: 'draft' | 'issued' | 'paid' | 'partial' | 'overdue' | 'void';

  @Column({ type: 'date' })
  issueDate: Date;

  @Column({ type: 'date', nullable: true })
  dueDate?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'USD' })
  currency: string;
}
