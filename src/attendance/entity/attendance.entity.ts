
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Class } from '../../classes/entity/class.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('attendances')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  student: User;

  @ManyToOne(() => User, { eager: true })
  teacher: User;

  @ManyToOne(() => Course, { eager: true })
  course: Course;

  @ManyToOne(() => Class, { eager: true })
  class: Class;

  @Column({ type: 'boolean' })
  isPresent: boolean;

  @Column({ type: 'date' })
  date: Date;
}
