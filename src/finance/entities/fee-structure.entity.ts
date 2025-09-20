import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Term } from '../../settings/entities/term.entity';
import { Class } from '../../classes/entity/class.entity';
import { School } from 'src/school/entities/school.entity';

@Entity('fee_structure')
export class FeeStructure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  feeType: string; // tuition, library, transport, exam, etc.

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: ['MWK', 'USD'], default: 'MWK' })
  currency: 'MWK' | 'USD';

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isOptional: boolean; // Some fees might be optional

  @Column({ type: 'varchar', length: 50, default: 'per_period' })
  frequency: 'per_period' | 'per_year' | 'one_time'; // How often the fee is charged

  @Column({ type: 'uuid' })
  termId: string;

  @ManyToOne(() => Term)
  @JoinColumn({ name: 'termId' })
  term: Term;

  @Column({ type: 'uuid', nullable: true })
  classId: string; // Optional: specific to a class

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'classId' })
  class: Class;

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId?: string;

  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'schoolId' })
  school?: School;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
