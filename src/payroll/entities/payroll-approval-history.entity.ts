import { BaseEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SalaryRun } from './salary-run.entity';

export type ApprovalAction = 'CREATED' | 'PREPARED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FINALIZED';

@Entity('payroll_approval_history')
@Index(['runId', 'createdAt'])
export class PayrollApprovalHistory extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  runId: string;

  @ManyToOne(() => SalaryRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  run: SalaryRun;

  @Column({ type: 'varchar' })
  action: ApprovalAction;

  @Column({ type: 'uuid', nullable: true })
  byUserId: string | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
