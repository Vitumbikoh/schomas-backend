import { Entity, Column, PrimaryGeneratedColumn, OneToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity()
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.settings)
  user: User;

  @Column({ type: 'jsonb', default: () => "'{\"email\": true, \"sms\": false, \"browser\": true, \"weeklySummary\": true}'" })
  notifications: {
    email: boolean;
    sms: boolean;
    browser: boolean;
    weeklySummary: boolean;
  };

  @Column({ type: 'jsonb', default: () => "'{\"twoFactor\": false}'" })
  security: {
    twoFactor: boolean;
  };

  
}