import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; // Import ConfigModule
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../user/users.module';
import { TeachersService } from './teacher.service';
import { User } from '../user/entities/user.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { ConfigModule } from 'src/config/config.module';
import { TeacherController } from './teacher.controller';

@Module({
  imports: [
    ConfigModule, 
    TypeOrmModule.forFeature([Teacher, User]),
    UsersModule,
    AuthModule,
    ConfigModule 
  ],
  providers: [TeachersService],
  controllers: [TeacherController],
  exports: [TeachersService],
})
export class TeachersModule {}