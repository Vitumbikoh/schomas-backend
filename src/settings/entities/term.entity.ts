import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AcademicCalendar } from './academic-calendar.entity';

@Entity()
export class Term {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  termName: string; // "Term 1", "Term 2", "Term 3"

  @Column({ type: 'date', nullable: true })
  startDate?: Date;

  @Column({ type: 'date', nullable: true })
  endDate?: Date;

  @Column({ default: false })
  isCurrent: boolean;

  @ManyToOne(() => AcademicCalendar)
  @JoinColumn({ name: 'academicYear', referencedColumnName: 'academicYear' })
  academicCalendar: AcademicCalendar;

  @Column()
  academicYear: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}