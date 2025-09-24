import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { School } from '../../school/entities/school.entity';

@Entity()
export class SchoolSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ nullable: true })
  schoolName: string;

  @Column({ nullable: true })
  schoolEmail: string;

  @Column({ nullable: true })
  schoolPhone: string;

  @Column({ nullable: true })
  schoolAddress: string;

  @Column({ type: 'text', nullable: true })
  schoolAbout: string;

  @Column({ nullable: true })
  schoolLogo: string;
}