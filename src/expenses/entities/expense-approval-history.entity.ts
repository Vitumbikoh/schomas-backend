import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, BaseEntity } from 'typeorm';
import { Expense } from './expense.entity';
import { User } from 'src/user/entities/user.entity';

export enum ApprovalAction {
  SUBMITTED = 'Submitted',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  PAID = 'Paid',
  COMMENTED = 'Commented'
}

@Entity('expense_approval_history')
export class ExpenseApprovalHistory extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  expenseId: string;

  @Column({
    type: 'enum',
    enum: ApprovalAction
  })
  action: ApprovalAction;

  @Column()
  performedBy: string;

  @Column({ nullable: true })
  performedByUserId: string;

  @Column({ type: 'text', nullable: true })
  comments: string;

  @Column({ type: 'text', nullable: true })
  previousStatus: string;

  @Column({ type: 'text', nullable: true })
  newStatus: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'int', nullable: true })
  approvalLevel: number;

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @ManyToOne(() => Expense, expense => expense.approvalHistory)
  @JoinColumn({ name: 'expenseId' })
  expense: Expense;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'performedByUserId' })
  performedByUser: User;
}
