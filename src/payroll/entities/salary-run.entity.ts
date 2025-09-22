import { BaseEntity, Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SalaryItem } from 'src/payroll/entities/salary-item.entity';

export type SalaryRunStatus = 'DRAFT' | 'PREPARED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FINALIZED';

@Entity('salary_runs')
@Index(['schoolId', 'period'], { unique: true })
export class SalaryRun extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  period: string; // YYYY-MM

  @Column({ type: 'uuid', nullable: true })
  termId: string | null;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status: SalaryRunStatus;

  @Column({ type: 'uuid', nullable: true })
  preparedBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  submittedBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  finalizedBy: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalGross: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalNet: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  employerCost: number; // employer contributions if any

  @Column({ type: 'int', default: 0 })
  staffCount: number;

  @Column({ type: 'uuid', nullable: true })
  postedExpenseId: string | null; // link to Expense once posted

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @OneToMany(() => SalaryItem, (item: SalaryItem) => item.run, { cascade: true })
  items: SalaryItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
