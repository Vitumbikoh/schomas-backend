import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { Class } from 'src/classes/entity/class.entity';

@Entity('schedules')
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: Date;

  @Column()
  day: string;

  @Column()
  startTime: Date;

  @Column()
  endTime: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.schedule)
  course: Course;

  @ManyToOne(() => Teacher, (teacher) => teacher.schedules)
  teacher: Teacher;

  @ManyToOne(() => Classroom, (classroom) => classroom.schedules)
  classroom: Classroom;

  @ManyToOne(() => Class, (classEntity) => classEntity.schedules)
  class: Class;
}