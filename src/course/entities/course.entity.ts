// src/course/entities/course.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  JoinTable,
  ManyToMany,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Exam } from 'src/exams/entities/exam.entity';
import { Class } from 'src/classes/entity/class.entity';
import { Student } from 'src/user/entities/student.entity';
import { School } from 'src/school/entities/school.entity';

@Entity()
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 'upcoming' })
  status: 'active' | 'inactive' | 'upcoming';

  @Column({ type: 'date', nullable: true })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column({ default: 0 })
  enrollmentCount: number;

  @Column({ type: 'jsonb', nullable: true })
  schedule?: {
    days: string[];
    time: string;
    location: string;
  };

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Class)
@JoinColumn({ name: 'classId' })
class: Class;

  @Column({ type: 'uuid', nullable: true })
  classId: string;

  @Column({ type: 'uuid', nullable: true })
  teacherId?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  // In course.entity.ts
  @ManyToOne(() => Teacher, (teacher) => teacher.courses)
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;
  
@OneToMany(() => Exam, (exam) => exam.course)
exams: Exam[];

  @ManyToMany(() => Student, (student) => student.courses)
  @JoinTable()
  students: Student[];

  @OneToMany(() => Enrollment, enrollment => enrollment.course)
enrollments: Enrollment[];

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

}
