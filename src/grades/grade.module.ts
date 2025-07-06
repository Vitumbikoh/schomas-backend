import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradeController } from './grade.controller';
import { GradeService } from './grade.service';
import { User } from '../user/entities/user.entity';
import { Course } from '../course/entities/course.entity';
import { Class } from '../classes/entity/class.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Student } from '../user/entities/student.entity';
import { AuthModule } from '../auth/auth.module';
import { Grade } from './entity/grade.entity';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Grade, User, Course, Class, Teacher, Student]),
    AuthModule,
    ConfigModule,
    
  ],
  controllers: [GradeController],
  providers: [GradeService],
})
export class GradeModule {}