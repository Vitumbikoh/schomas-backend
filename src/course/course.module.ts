import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './entities/course.entity';
import { CourseService } from './course.service';
import { Teacher } from 'src/user/entities/teacher.entity';
import { UsersModule } from 'src/user/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Teacher]), 
    UsersModule
  ],
  providers: [CourseService],
  exports: [CourseService], 
})
export class CourseModule {}