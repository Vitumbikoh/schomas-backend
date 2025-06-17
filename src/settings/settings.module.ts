import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { UserSettings } from './entities/user-settings.entity';
import { User } from 'src/user/entities/user.entity';
import { SchoolSettings } from './entities/school-settings.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSettings, SchoolSettings]),
    AuthModule,
    ConfigModule,
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [ TypeOrmModule],
})
export class SettingsModule {}
