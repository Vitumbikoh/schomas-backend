import { BaseEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PayComponent } from './pay-component.entity';
import { User } from '../../user/entities/user.entity';

@Entity('staff_pay_assignments')
@Index(['schoolId', 'userId', 'componentId'])
@Index(['schoolId', 'isActive'])
@Index(['userId', 'isActive'])
export class StaffPayAssignment extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  componentId: string;

  @ManyToOne(() => PayComponent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'componentId' })
  component: PayComponent;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'timestamp', nullable: true })
  effectiveFrom: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  effectiveTo: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
