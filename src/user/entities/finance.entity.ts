import { Entity, Column, OneToOne, JoinColumn, BaseEntity, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { FeePayment } from 'src/finance/entities/fee-payment.entity';
import { Budget } from 'src/finance/entities/budget.entity';

@Entity()
export class Finance extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  department: string;

  @Column({ default: false })
  canApproveBudgets: boolean;

  @Column({ default: true })
  canProcessPayments: boolean;

  @OneToOne(() => User, (user) => user.finance)
  @JoinColumn()
  user: User;

  @OneToMany(() => FeePayment, (payment) => payment.processedBy)
  processedPayments: FeePayment[];

  @OneToMany(() => Budget, (budget) => budget.approvedBy)
  approvedBudgets: Budget[];
}