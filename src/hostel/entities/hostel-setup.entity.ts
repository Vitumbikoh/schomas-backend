import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../school/entities/school.entity';

export enum HostelRoomNamingMode {
  MANUAL = 'manual',
  NUMERIC = 'numeric',
  ALPHABETICAL = 'alphabetical',
}

@Entity()
@Unique(['schoolId'])
export class HostelSetup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'varchar', default: HostelRoomNamingMode.MANUAL })
  roomNamingMode: string;

  @Column({ type: 'varchar', length: 20, default: 'A' })
  numericPrefix: string;

  @Column({ type: 'varchar', length: 30, default: 'Ground Floor' })
  defaultFloor: string;

  @Column({ type: 'int', default: 10 })
  defaultRoomCapacity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
