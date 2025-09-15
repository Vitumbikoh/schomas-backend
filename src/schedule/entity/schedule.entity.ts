import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { Class } from 'src/classes/entity/class.entity';
import { School } from 'src/school/entities/school.entity';

@Entity('schedules')
@Index(['schoolId', 'day'])
@Index(['schoolId', 'day', 'startTime', 'endTime'])
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: Date;
  
  @Column({
    // Remove the manual column and make it computed
    type: 'varchar',
    transformer: {
      to: (value: string) => value, // We'll handle this in service
      from: (value: string) => value,
    },
  })
  day: string;

  // Use time without timezone for comparisons
  @Column({ type: 'time without time zone' })
  startTime: string; // HH:mm:ss

  @Column({ type: 'time without time zone' })
  endTime: string; // HH:mm:ss

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

  @ManyToOne(() => Classroom, (classroom) => classroom.schedules, { nullable: true })
  classroom: Classroom;

  @ManyToOne(() => Class, (classEntity) => classEntity.schedules)
  class: Class;

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;
}
