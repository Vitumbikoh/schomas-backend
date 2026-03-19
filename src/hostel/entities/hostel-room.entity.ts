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
import { Hostel } from './hostel.entity';
import { HostelAllocation } from './hostel-allocation.entity';

@Entity()
@Unique(['hostelId', 'name'])
export class HostelRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  hostelId: string;

  @ManyToOne(() => Hostel, (hostel) => hostel.rooms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hostelId' })
  hostel: Hostel;

  @Column()
  name: string;

  @Column({ nullable: true })
  floor?: string;

  @Column({ type: 'int', default: 0 })
  capacity: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => HostelAllocation, (allocation) => allocation.room)
  allocations: HostelAllocation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
