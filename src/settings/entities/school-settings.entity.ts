import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class SchoolSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  schoolName: string;

  @Column()
  schoolEmail: string;

  @Column()
  schoolPhone: string;

  @Column()
  schoolAddress: string;

  @Column('text')
  schoolAbout: string;
}