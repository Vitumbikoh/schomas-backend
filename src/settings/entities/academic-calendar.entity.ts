// src/settings/entities/academic-calendar.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { AcademicYear } from './academic-year.entity';

@Entity()
export class AcademicCalendar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  academicYear: string;

  @Column({ type: 'date', nullable: true })
  startDate?: Date;

  @Column({ type: 'date', nullable: true })
  endDate?: Date;

  @Column({ default: false })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

   @OneToMany(() => AcademicYear, academicYear => academicYear.academicCalendar)
  academicYears: AcademicYear[];
}