import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Parent } from 'src/user/entities/parent.entity';
import { User } from 'src/user/entities/user.entity';
import { UsersModule } from 'src/user/users.module';

import { StudentsController } from './student.controller';
import { StudentsService } from './student.service';
import { Student } from 'src/user/entities/student.entity';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, User, Parent]),
    UsersModule,
    AuthModule,
    ConfigModule 
    
  ],
  providers: [StudentsService],
  controllers: [StudentsController],
  exports: [StudentsService],
})
export class StudentsModule {}