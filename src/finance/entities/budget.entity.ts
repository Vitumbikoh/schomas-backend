// src/finance/entities/budget.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Finance } from '../../user/entities/finance.entity';
import { Department } from './department.entity';
import { User } from 'src/user/entities/user.entity';

@Entity()
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fiscalYear: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  totalAmount: number;

  @Column({ type: 'jsonb', nullable: true })  // For complex breakdown data
  breakdown: Record<string, number>;

  @Column({ default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  approvalDate: Date;

  @Column({ type: 'text', nullable: true })  // Proper type for text notes
  approvalNotes: string;

  @ManyToOne(() => Department, (dept) => dept.budgets)
  department: Department;

  @ManyToOne(() => Finance, (finance) => finance.approvedBudgets, { nullable: true })
  approvedBy: Finance;


  @ManyToOne(() => User, { nullable: true })
  approvedByAdmin?: User;

}