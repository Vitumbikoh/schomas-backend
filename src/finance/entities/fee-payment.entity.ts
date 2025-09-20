import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { Finance } from '../../user/entities/finance.entity';
import { User } from '../../user/entities/user.entity';
import { Term } from '../../settings/entities/term.entity';
import { School } from 'src/school/entities/school.entity';

@Entity()
export class FeePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', nullable: true }) // Fixed from previous error
  receiptNumber: string | null;

  @Column({ type: 'enum', enum: ['MWK', 'USD'], default: 'MWK' })
  currency: 'MWK' | 'USD';

  @Column()
  paymentType: string;

  @Column({ type: 'enum', enum: ['cash', 'bank_transfer'], default: 'cash' })
  paymentMethod: 'cash' | 'bank_transfer';

  @Column({ type: 'text', nullable: true }) // Fix: Explicitly set type to text
  notes: string | null;

  @Column({ type: 'enum', enum: ['pending', 'completed', 'failed'], default: 'completed' })
  status: 'pending' | 'completed' | 'failed';

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
}