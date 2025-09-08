import { Schedule } from 'src/schedule/entity/schedule.entity';
import { Student } from 'src/user/entities/student.entity';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { School } from 'src/school/entities/school.entity';

@Index('UQ_class_name_school', ['schoolId', 'name'], { unique: true })
@Index('UQ_class_num_school', ['schoolId', 'numericalName'], { unique: true })
@Entity('classes')
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'int' })
  numericalName: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Schedule, (schedule) => schedule.class)
  schedules: Schedule[];

  @OneToMany(() => Student, (student) => student.class)
  students: Student[];

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

}