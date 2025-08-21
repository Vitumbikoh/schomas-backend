import { Entity, Column, OneToOne, JoinColumn, OneToMany, BaseEntity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { Student } from './student.entity';
import { School } from '../../school/entities/school.entity';

@Entity()
export class Parent extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  occupation: string;

  @OneToMany(() => Student, (student) => student.parent)
  children: Student[];

  @OneToOne(() => User, (user) => user.parent)
  @JoinColumn()
  user: User;

  @OneToMany(() => Student, (student) => student.parent, { nullable: true })
  student: Student[];

  // Multi-tenant scope
  @Column({ type: 'uuid', nullable: true })
  schoolId: string;
  @ManyToOne(() => School, (school) => school.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;
}