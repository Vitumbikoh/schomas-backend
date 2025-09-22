import { BaseEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PayComponentType = 'BASIC' | 'ALLOWANCE' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
export type ComputeMethod = 'FIXED' | 'FORMULA' | 'TABLE';

@Entity('pay_components')
@Index(['schoolId', 'code'], { unique: true })
export class PayComponent extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string; // e.g., BASIC, HOUSE, PAYE, NHIF

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  type: PayComponentType;

  @Column({ type: 'boolean', default: true })
  taxable: boolean;

  @Column({ type: 'boolean', default: false })
  recurring: boolean; // if true, assigned via StaffPayAssignment

  @Column({ type: 'varchar', default: 'FIXED' })
  computeMethod: ComputeMethod;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  defaultAmount: number | null;

  @Column({ type: 'text', nullable: true })
  formula: string | null; // when computeMethod = FORMULA

  @Column({ type: 'varchar', nullable: true })
  department: string | null; // if set, auto-assign to all staff in this department

  @Column({ type: 'boolean', default: false })
  autoAssign: boolean; // if true, automatically assign to qualifying staff

  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
