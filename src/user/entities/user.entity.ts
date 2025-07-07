import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Teacher } from './teacher.entity';
import { Student } from './student.entity';
import { Parent } from './parent.entity';
import { Finance } from './finance.entity';
import { Role } from '../enums/role.enum';
import { Course } from 'src/course/entities/course.entity';
import { UserSettings } from 'src/settings/entities/user-settings.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

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

  @OneToOne(() => UserSettings, (settings) => settings.user, { cascade: true })
  @JoinColumn()
  settings: UserSettings;
  
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

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => Course, (course) => course.teacher)
  courses: Course[];
}
