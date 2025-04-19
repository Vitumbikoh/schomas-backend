import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { Finance } from '../../user/entities/finance.entity';
import { User } from 'src/user/entities/user.entity';

@Entity()
export class FeePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column()
  referenceNumber: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'completed' | 'failed';

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  processedAt: Date;

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