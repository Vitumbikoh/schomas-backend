import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, BaseEntity } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { School } from 'src/school/entities/school.entity';
import { ExpenseApprovalHistory } from './expense-approval-history.entity';
import { Term } from 'src/settings/entities/term.entity';

export enum ExpenseCategory {
  PERSONNEL = 'Personnel',
  ACADEMIC_RESOURCES = 'Academic Resources',
  FACILITIES = 'Facilities',
  TRANSPORTATION = 'Transportation',
  FOOD_SERVICES = 'Food Services',
  ADMINISTRATIVE = 'Administrative',
  EMERGENCY = 'Emergency',
  OTHER = 'Other'
}

export enum ExpenseStatus {
  PENDING = 'Pending',
  DEPARTMENT_APPROVED = 'Department Approved',
  FINANCE_REVIEW = 'Finance Review',
  PRINCIPAL_APPROVED = 'Principal Approved',
  BOARD_REVIEW = 'Board Review',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  PAID = 'Paid'
}

export enum ExpensePriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
}

@Entity('expenses')
export class Expense extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  expenseNumber: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: ExpenseCategory,
    default: ExpenseCategory.OTHER
  })
  category: ExpenseCategory;

  @Column()
  department: string;

  @Column({ nullable: true })
  requestedBy: string;

  @Column({ type: 'date' })
  requestDate: Date;

  @Column({ type: 'date', nullable: true })
  dueDate: Date;

  @Column({
    type: 'enum',
    enum: ExpenseStatus,
    default: ExpenseStatus.PENDING
  })
  status: ExpenseStatus;

  @Column({ type: 'int', default: 0 })
  approvalLevel: number;

  @Column({ nullable: true })
  budgetCode: string;

  @Column({
    type: 'enum',
    enum: ExpensePriority,
    default: ExpensePriority.MEDIUM
  })
  priority: ExpensePriority;

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @Column({ type: 'uuid', nullable: true })
  termId: string | null;

  @Column({ type: 'json', nullable: true })
  attachments: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  approvedAmount: number;

  @Column({ type: 'date', nullable: true })
  approvedDate: Date;

  @Column({ nullable: true })
  approvedBy: string;

  @Column({ type: 'date', nullable: true })
  paidDate: Date;

  @Column({ nullable: true })
  paidBy: string;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Relations
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser: User;

  @Column({ nullable: true })
  requestedByUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approvedByUserId' })
  approvedByUser: User;

  @Column({ nullable: true })
  approvedByUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'paidByUserId' })
  paidByUser: User;

  @Column({ nullable: true })
  paidByUserId: string;

  @ManyToOne(() => School, { nullable: true })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @ManyToOne(() => Term, { nullable: true })
  @JoinColumn({ name: 'termId' })
  term: Term;

  @OneToMany(() => ExpenseApprovalHistory, history => history.expense, { cascade: true })
  approvalHistory: ExpenseApprovalHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
