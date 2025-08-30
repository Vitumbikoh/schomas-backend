import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Student } from 'src/user/entities/student.entity';
import { Class } from 'src/classes/entity/class.entity';
import { School } from 'src/school/entities/school.entity';

@Entity()
export class StudentClassPromotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;
  @ManyToOne(() => Student, (student) => student.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid', nullable: true })
  fromClassId: string | null;
  @ManyToOne(() => Class, (cls) => cls.id, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fromClassId' })
  fromClass: Class | null;

  @Column({ type: 'uuid' })
  toClassId: string;
  @ManyToOne(() => Class, (cls) => cls.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toClassId' })
  toClass: Class;

  @Column({ type: 'uuid', nullable: true })
  triggeredByUserId: string | null;

  // snapshot of enrollments before promotion
  @Column({ type: 'jsonb', nullable: true })
  previousEnrollments: Array<{ courseId: string; courseName: string; classId: string | null; termId: string | null }> | null;

  // snapshot after promotion auto-enroll actions
  @Column({ type: 'jsonb', nullable: true })
  newEnrollments: Array<{ courseId: string; courseName: string; classId: string | null; termId: string | null }> | null;

  // diff for quick analytics
  @Column({ type: 'jsonb', nullable: true })
  changes: {
    added: string[]; // courseIds
    removed: string[]; // courseIds
    retained: string[]; // courseIds
  } | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string | null;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School | null;
}
