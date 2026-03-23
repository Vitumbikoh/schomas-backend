import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../school/entities/school.entity';
import { User } from '../../user/entities/user.entity';
import { AssetAssignment } from './asset-assignment.entity';
import { MaintenanceLog } from './maintenance-log.entity';

export enum AssetStatus {
  ACTIVE = 'active',
  UNDER_MAINTENANCE = 'under_maintenance',
  RETIRED = 'retired',
}

@Entity('assets')
@Unique(['schoolId', 'assetTag'])
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  assetTag: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'date', nullable: true })
  purchaseDate?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  purchaseCost: number;

  @Column({ nullable: true })
  supplier?: string;

  @Column({ type: 'varchar', default: AssetStatus.ACTIVE })
  status: AssetStatus;

  @Column({ nullable: true })
  location?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ type: 'uuid', nullable: true })
  assignedUserId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedUserId' })
  assignedUser?: User;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => AssetAssignment, (assignment) => assignment.asset)
  assignments: AssetAssignment[];

  @OneToMany(() => MaintenanceLog, (log) => log.asset)
  maintenanceLogs: MaintenanceLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
