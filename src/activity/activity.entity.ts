// src/activity/activity.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from '../user/entities/user.entity';

@Entity()
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  entityId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Column()
  type: string;

  @Column()
  action: string;

  @ManyToOne(() => User, (user) => user.activities, { eager: false })
  user: User;
}
