import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { School } from '../../school/entities/school.entity';

export enum NotificationType {
  CREDENTIALS = 'credentials',
  SYSTEM = 'system',
  ALERT = 'alert',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.MEDIUM,
  })
  priority: NotificationPriority;

  @Column({ default: false })
  read: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @ManyToOne(() => School, { nullable: true })
  @JoinColumn({ name: 'schoolId' })
  school?: School;

  @Column({ nullable: true })
  schoolId?: string;

  /**
   * Optional list of roles that should receive this notification.
   * null / undefined = only ADMIN and SUPER_ADMIN see it (default for system/admin notices).
   * e.g. ['STUDENT'] means only students see it; ['STUDENT','TEACHER'] targets both.
   */
  @Column({ type: 'jsonb', nullable: true })
  targetRoles?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  readAt: Date;
}