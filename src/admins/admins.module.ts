import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { UsersModule } from 'src/user/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
