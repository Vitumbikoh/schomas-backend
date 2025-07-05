import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { Finance } from '../../user/entities/finance.entity';
import { User } from '../../user/entities/user.entity';

@Entity()
export class FeePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', nullable: true }) // Fixed from previous error
  receiptNumber: string | null;

  @Column()
  paymentType: string;

  @Column({ type: 'enum', enum: ['cash', 'bank_transfer'] })
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

  @ManyToOne(() => Finance, { nullable: true })
  @JoinColumn({ name: 'processedById' })
  processedBy?: Finance;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processedByAdminId' })
  processedByAdmin?: User;
}