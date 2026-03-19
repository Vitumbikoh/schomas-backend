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
import { HostelRoom } from './hostel-room.entity';
import { HostelAllocation } from './hostel-allocation.entity';

@Entity()
@Unique(['schoolId', 'name'])
export class Hostel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'mixed' })
  gender: string;

  @Column({ type: 'int', default: 0 })
  capacity: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ nullable: true })
  wardenName?: string;

  @Column({ nullable: true })
  wardenPhone?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => HostelRoom, (room) => room.hostel)
  rooms: HostelRoom[];

  @OneToMany(() => HostelAllocation, (allocation) => allocation.hostel)
  allocations: HostelAllocation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
