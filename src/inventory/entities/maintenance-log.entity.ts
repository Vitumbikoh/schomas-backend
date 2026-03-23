import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../school/entities/school.entity';
import { User } from '../../user/entities/user.entity';
import { Asset } from './asset.entity';

export enum MaintenanceStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

export enum MaintenanceType {
  REPAIR = 'repair',
  SERVICE = 'service',
  INSPECTION = 'inspection',
}

@Entity('maintenance_logs')
export class MaintenanceLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.maintenanceLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @Column({ type: 'text' })
  issueDescription: string;

  @Column({ type: 'varchar', default: MaintenanceType.REPAIR })
  maintenanceType: MaintenanceType;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  maintenanceDate: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  repairCost: number;

  @Column({ type: 'varchar', default: MaintenanceStatus.PENDING })
  status: MaintenanceStatus;

  @Column({ type: 'text', nullable: true })
  resolutionNotes?: string;

  @Column({ type: 'date', nullable: true })
  nextMaintenanceDate?: Date;

  @Column({ type: 'uuid', nullable: true })
  reportedById?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reportedById' })
  reportedBy?: User;

  @Column({ type: 'uuid', nullable: true })
  completedById?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'completedById' })
  completedBy?: User;

  @Column({ type: 'uuid', nullable: true })
  expenseId?: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
