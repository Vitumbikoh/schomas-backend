import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class SchoolSettings {
  @PrimaryColumn({ type: 'varchar', default: 'default-school-settings' })
  id: string;

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
}