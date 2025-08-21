import { Module } from '@nestjs/common';
import { SuperAdminsService } from './super-admins.service';
import { SuperAdminsController } from './super-admins.controller';
import { UsersModule } from '../user/users.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [UsersModule, AuthModule, ConfigModule],
  controllers: [SuperAdminsController],
  providers: [SuperAdminsService],
})
export class SuperAdminsModule {}
