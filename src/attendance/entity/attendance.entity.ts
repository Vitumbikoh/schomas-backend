// src/attendance/entities/attendance.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Student } from 'src/user/entities/student.entity';
import { Course } from 'src/course/entities/course.entity';
import { Class } from 'src/classes/entity/class.entity';

@Entity()
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { eager: true })
  student: Student;

  @ManyToOne(() => Course, { eager: true })
  course: Course;

  @ManyToOne(() => Class, { eager: true })
  class: Class;

  @Column()
  date: Date;

  @Column({ default: false })
  present: boolean;

  @Column({ nullable: true })
  remarks: string;
}