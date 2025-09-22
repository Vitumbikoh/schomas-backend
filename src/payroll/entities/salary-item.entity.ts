import { BaseEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SalaryRun } from './salary-run.entity';
import { User } from '../../user/entities/user.entity';

@Entity('salary_items')
@Index(['schoolId', 'runId', 'userId'])
export class SalaryItem extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  runId: string;

  @ManyToOne(() => SalaryRun, (run) => run.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: SalaryRun;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'varchar' })
  staffName: string; // snapshot

  @Column({ type: 'varchar', nullable: true })
  department: string | null; // snapshot

  @Column({ type: 'jsonb', nullable: true })
  breakdown: Array<{ code: string; name: string; type: string; amount: number; taxable: boolean }>; // components

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  grossPay: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  taxablePay: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  paye: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  nhif: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  nssf: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  otherDeductions: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  netPay: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  employerContrib: number; // employer cost portion

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
