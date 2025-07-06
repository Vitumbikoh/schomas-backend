// // src/grade/entities/grade.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Course } from '../../course/entities/course.entity';
import { Class } from '../../classes/entity/class.entity';

@Entity()
export class Grade {
  @PrimaryGeneratedColumn('uuid')
  gradeId: string;

  @Column()
  studentId: string;

  @Column()
  grade: string;

  @Column()
  assessmentType: string;

  @ManyToOne(() => User, (user) => user.id)
  student: User;

  @ManyToOne(() => User, (user) => user.id)
  teacher: User;

  @ManyToOne(() => Course, (course) => course.id)
  course: Course;

  @ManyToOne(() => Class, (cls) => cls.id)
  class: Class;

  @CreateDateColumn()
  date: Date;
}