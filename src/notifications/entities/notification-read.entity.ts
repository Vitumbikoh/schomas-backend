import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Notification } from './notification.entity';

@Entity('notification_reads')
@Unique('UQ_notification_reads_notification_user', ['notificationId', 'userId'])
export class NotificationRead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  notificationId: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  schoolId?: string;

  @CreateDateColumn()
  readAt: Date;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notificationId' })
  notification: Notification;
}
