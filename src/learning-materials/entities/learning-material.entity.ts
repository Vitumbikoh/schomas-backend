import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('learning_material')
export class LearningMaterial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  classId: string;

  @ManyToOne(() => Class)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column({ type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @Column({ type: 'uuid' })
  teacherId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'teacherId' })
  teacher: User;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 255 })
  filePath: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}