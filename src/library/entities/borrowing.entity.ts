import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Book } from './book.entity';
import { Student } from '../../user/entities/student.entity';
import { School } from '../../school/entities/school.entity';

@Entity()
export class Borrowing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  bookId: string | null; // may be null if borrowed by custom name

  @ManyToOne(() => Book, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bookId' })
  book?: Book | null;

  @Column({ nullable: true })
  bookName?: string; // in case of direct entry when not cataloged yet

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'timestamp' })
  borrowedAt: Date;

  @Column({ type: 'timestamp' })
  dueAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt?: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fine: string; // store as string to preserve precision

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
