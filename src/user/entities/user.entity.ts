import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { Teacher } from './teacher.entity';
import { Student } from './student.entity';
import { Parent } from './parent.entity';
import { Finance } from './finance.entity';
import { Role } from '../enums/role.enum';
import { School } from '../../school/entities/school.entity';
import { Course } from 'src/course/entities/course.entity';
import { UserSettings } from 'src/settings/entities/user-settings.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  // Explicit type to avoid reflect-metadata emitting Object for union (string | null)
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email?: string | null;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.STUDENT,
  })
  role: Role;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  image?: string;

  // Multi-tenancy: nullable for SUPER_ADMIN only
  @Column({ type: 'uuid', nullable: true })
  schoolId?: string | null;

  @ManyToOne(() => School, (school) => school.users, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'schoolId' })
  school?: School | null;

  @OneToOne(() => UserSettings, (settings) => settings.user, { cascade: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  settings?: UserSettings | null;
  
  @OneToOne(() => Teacher, (teacher) => teacher.user, { nullable: true })
  @JoinColumn()
  teacher?: Teacher;

  @OneToOne(() => Student, (student) => student.user, { nullable: true })
  @JoinColumn()
  student?: Student;

  @OneToOne(() => Parent, (parent) => parent.user, { nullable: true })
  @JoinColumn()
  parent?: Parent;

  @OneToOne(() => Finance, (finance) => finance.user, { nullable: true })
  @JoinColumn()
  finance?: Finance;

  @Column({ default: true })
  isActive: boolean;

  // Require user to change password on first login (for auto-provisioned accounts)
  @Column({ default: false })
  forcePasswordReset: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt?: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => Course, (course) => course.teacher)
  courses: Course[];
}
