import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../user/users.module';
import { TeachersService } from './teacher.service';
import { User } from '../user/entities/user.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { ConfigModule } from 'src/config/config.module';
import { TeacherController } from './teacher.controller';
import { UsersService } from 'src/user/user.service';
import { CourseService } from 'src/course/course.service';
import { Course } from 'src/course/entities/course.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Teacher, User, Course]),
    UsersModule,
    AuthModule,
  ],
  providers: [
    TeachersService,
    UsersService,
    CourseService // Add UserService to providers
  ],
  controllers: [TeacherController],
  exports: [TeachersService],
})
export class TeachersModule {}