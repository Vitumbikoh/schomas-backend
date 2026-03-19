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
import { Student } from '../../user/entities/student.entity';
import { Hostel } from './hostel.entity';
import { HostelRoom } from './hostel-room.entity';

@Entity()
export class HostelAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid' })
  hostelId: string;

  @ManyToOne(() => Hostel, (hostel) => hostel.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hostelId' })
  hostel: Hostel;

  @Column({ type: 'uuid' })
  roomId: string;

  @ManyToOne(() => HostelRoom, (room) => room.allocations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: HostelRoom;

  @Column({ nullable: true })
  bedNumber?: string;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  releasedAt?: Date;

  @Column({ nullable: true })
  releaseReason?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

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
