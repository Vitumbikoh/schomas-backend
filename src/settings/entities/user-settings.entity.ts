import { User } from 'src/user/entities/user.entity';
import { Entity, Column, PrimaryGeneratedColumn, OneToOne } from 'typeorm';

@Entity()
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.settings)
  user: User;

  @Column({ type: 'jsonb', default: { email: true, sms: false, browser: true, weeklySummary: true } })
  notifications: {
    email: boolean;
    sms: boolean;
    browser: boolean;
    weeklySummary: boolean;
  };

  @Column({ type: 'jsonb', default: { twoFactor: false } })
  security: {
    twoFactor: boolean;
  };

  @OneToOne(() => UserSettings, (settings) => settings.user)
settings: UserSettings;
}