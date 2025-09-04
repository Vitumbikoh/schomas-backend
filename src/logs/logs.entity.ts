import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string;

  @Column({ length: 50 })
  module: string;

  @Column({ type: 'enum', enum: ['info', 'warn', 'error', 'debug'], default: 'info' })
  level: 'info' | 'warn' | 'error' | 'debug';

  @Column('json', { nullable: true })
  performedBy?: Record<string, any>;

  @Column('json', { nullable: true })
  studentCreated?: Record<string, any>;

  @Column({ nullable: true })
  entityId?: string;

  @Column({ nullable: true })
  entityType?: string;

  @Column('json', { nullable: true })
  oldValues?: Record<string, any>;

  @Column('json', { nullable: true })
  newValues?: Record<string, any>;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  // Multi-tenancy: associate log with a school (tenant) when applicable
  @Index()
  @Column({ nullable: true })
  schoolId?: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;
}
