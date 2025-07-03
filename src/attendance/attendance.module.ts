import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './entity/attendance.entity';
import { AuthModule } from 'src/auth/auth.module';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { User } from 'src/user/entities/user.entity';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ConfigModule } from 'src/config/config.module';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Student } from 'src/user/entities/student.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, User, Course, Class, Teacher, Student]),
    AuthModule,
    ConfigModule, 
  ],
  providers: [AttendanceService],
  controllers: [AttendanceController],
})
export class AttendanceModule {}