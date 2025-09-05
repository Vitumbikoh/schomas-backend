import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [RoutesController],
})
export class RoutesModule {}
