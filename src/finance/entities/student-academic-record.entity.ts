import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn, Index } from 'typeorm';
import { Student } from '../../user/entities/student.entity';
import { AcademicCalendar } from '../../settings/entities/academic-calendar.entity';
import { Term } from '../../settings/entities/term.entity';
import { Class } from '../../classes/entity/class.entity';
import { School } from '../../school/entities/school.entity';

export enum StudentStatus {
  ACTIVE = 'active',
  GRADUATED = 'graduated',
  TRANSFERRED = 'transferred',
  DROPPED_OUT = 'dropped_out'
}

/**
 * Immutable academic record that snapshots student's academic status at a specific term.
 * Once created, these records should NEVER be modified to maintain historical integrity.
 */
@Entity('student_academic_records')
@Index('idx_student_term_unique', ['studentId', 'termId'], { unique: true })
@Index('idx_academic_record_lookup', ['academicCalendarId', 'termId', 'status'])
export class StudentAcademicRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Multi-tenancy
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  // Academic context (immutable snapshot)
  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid' })
  academicCalendarId: string;

  @ManyToOne(() => AcademicCalendar, { eager: true })
  @JoinColumn({ name: 'academicCalendarId' })
  academicCalendar: AcademicCalendar;

  @Column({ type: 'uuid' })
  termId: string;

  @ManyToOne(() => Term, { eager: true })
  @JoinColumn({ name: 'termId' })
  term: Term;

  @Column({ type: 'uuid', nullable: true })
  classId: string;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'classId' })
  class: Class;

  // Student status during this term (immutable)
  @Column({
    type: 'enum',
    enum: StudentStatus,
    default: StudentStatus.ACTIVE
  })
  status: StudentStatus;

  // Additional academic metadata
  @Column({ type: 'text', nullable: true })
  notes: string;

  // Whether this record was created by promotion/graduation process
  @Column({ default: false })
  isPromotionRecord: boolean;

  // Timestamps (immutable once created)
  @CreateDateColumn()
  recordedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  recordedByUserId: string;
}