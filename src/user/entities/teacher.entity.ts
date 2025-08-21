import {
  Entity,
  Column,
  OneToOne,
  JoinColumn,
  BaseEntity,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';
import { Course } from '../../course/entities/course.entity';
import { School } from '../../school/entities/school.entity';
import { Exam } from 'src/exams/entities/exam.entity';
import { Schedule } from 'src/schedule/entity/schedule.entity';

@Entity()
export class Teacher extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  qualification: string;

  @Column({ nullable: true })
  subjectSpecialization: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  hireDate: Date;

  @Column({ type: 'float', nullable: true })
  yearsOfExperience: number;

  @Column({ default: 'active' })
  status: string;

  @OneToOne(() => User, (user) => user.teacher)
  @JoinColumn()
  user: User;

  @OneToMany(() => Course, (course) => course.teacher)
  courses: Course[];

  @Column({ name: 'userId' })
  userId: string;

  @OneToMany(() => Exam, (exam) => exam.teacher)
  exams: Exam[];

  @OneToMany(() => Schedule, (schedule) => schedule.teacher)
  schedules: Schedule[];

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;
  
}
