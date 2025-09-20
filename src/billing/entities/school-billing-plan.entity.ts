import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { School } from '../../school/entities/school.entity';

@Entity('school_billing_plan')
export class SchoolBillingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  // Usage-based price per active student
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  ratePerStudent: number;

  @Column({ type: 'enum', enum: ['MWK', 'USD'], default: 'MWK' })
  currency: 'MWK' | 'USD';

  // Default billing cadence preference (can still generate per term or per year explicitly)
  @Column({ type: 'enum', enum: ['per_term', 'per_academic_year'], default: 'per_term' })
  cadence: 'per_term' | 'per_academic_year';

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  effectiveFrom?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  effectiveTo?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
