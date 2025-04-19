import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentsService } from './parents.service';
import { ParentsController } from './parents.controller';
import { AuthModule } from '../auth/auth.module';
import { Parent } from 'src/user/entities/parent.entity';
import { Student } from 'src/user/entities/student.entity';
import { User } from 'src/user/entities/user.entity';
import { UsersModule } from 'src/user/users.module';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Parent, User, Student]),
    UsersModule,
    AuthModule,
    ConfigModule 
  ],
  providers: [ParentsService],
  controllers: [ParentsController],
  exports: [ParentsService],
})
export class ParentsModule {}