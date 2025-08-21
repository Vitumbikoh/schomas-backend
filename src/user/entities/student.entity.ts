// src/user/entities/student.entity.ts
import {
  Entity,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
  BaseEntity,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Parent } from './parent.entity';
import { FeePayment } from 'src/finance/entities/fee-payment.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { Grade } from 'src/grades/entity/grade.entity';
import { School } from '../../school/entities/school.entity';
@Entity()
export class Student extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;


  @Column({ unique: true }) 
  studentId: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  gradeLevel: string;

  @ManyToOne(() => Parent, (parent) => parent.children, { nullable: true })
  parent: Parent | null;

  @OneToOne(() => User, (user) => user.student)
  @JoinColumn()
  user: User;

  @ManyToOne(() => Class, (cls) => cls.students)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column({ type: 'uuid', nullable: true })
  classId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => FeePayment, (payment) => payment.student)
  payments: FeePayment[];

  @OneToMany(() => Enrollment, (enrollment) => enrollment.student)
  enrollments: Enrollment[];

  @OneToMany(() => Grade, grade => grade.student)
  grades: Grade[];

  @ManyToMany(() => Course, (course) => course.students)
  courses: Course[];

   @Column({ nullable: true })
  academicYearId: string;

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  
}
