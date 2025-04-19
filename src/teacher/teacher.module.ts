import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; // Import ConfigModule
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../user/users.module';
import { TeachersController } from './teacher.controller';
import { TeachersService } from './teacher.service';
import { User } from '../user/entities/user.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    ConfigModule, // Add ConfigModule to make ConfigService available
    TypeOrmModule.forFeature([Teacher, User]),
    UsersModule,
    AuthModule,
    ConfigModule 
  ],
  providers: [TeachersService],
  controllers: [TeachersController],
  exports: [TeachersService],
})
export class TeachersModule {}