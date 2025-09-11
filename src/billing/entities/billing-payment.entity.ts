import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { BillingInvoice } from './billing-invoice.entity';
import { School } from '../../school/entities/school.entity';
import { User } from '../../user/entities/user.entity';

@Entity('billing_payment')
export class BillingPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  invoiceId: string;
  @ManyToOne(() => BillingInvoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: BillingInvoice;

  @Column({ type: 'uuid' })
  schoolId: string;
  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: ['manual', 'bank_transfer'], default: 'manual' })
  method: 'manual' | 'bank_transfer';

  @Column({ type: 'varchar', nullable: true })
  reference?: string | null; // e.g., transaction id or note

  @Column({ type: 'uuid', nullable: true })
  processedById?: string | null;
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processedById' })
  processedBy?: User | null;

  @CreateDateColumn()
  createdAt: Date;
}
