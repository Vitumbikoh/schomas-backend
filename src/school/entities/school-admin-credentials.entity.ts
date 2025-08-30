import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { School } from './school.entity';

@Entity('school_admin_credentials')
export class SchoolAdminCredentials {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column()
  schoolId: string;

  @Column()
  username: string;

  @Column()
  email: string;

  @Column()
  password: string; // This will store the plain text password for super admin reference

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  passwordChanged: boolean; // Track if admin has changed the default password

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
