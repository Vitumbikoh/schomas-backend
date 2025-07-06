import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Parent } from 'src/user/entities/parent.entity';
import { User } from 'src/user/entities/user.entity';
import { UsersModule } from 'src/user/users.module';
import { StudentsService } from './student.service';
import { Student } from 'src/user/entities/student.entity';
import { ConfigModule } from 'src/config/config.module';
import { StudentController } from './student.controller';
import { Schedule } from 'src/schedule/entity/schedule.entity';
import { ScheduleService } from 'src/schedule/schedule.service';
import { Course } from 'src/course/entities/course.entity';
import { CourseService } from 'src/course/course.service';
import { Class } from 'src/classes/entity/class.entity';
import { ClassService } from 'src/classes/class.service';
import { Classroom } from 'src/classroom/entity/classroom.entity';
import { ClassroomService } from 'src/classroom/classroom.service';
import { LearningMaterial } from 'src/learning-materials/entities/learning-material.entity';
import { LearningMaterialsService } from 'src/learning-materials/learning-materials.service';
import { LearningMaterialsModule } from 'src/learning-materials/learning-materials.module';
import { EnrollmentModule } from 'src/enrollment/enrollment.module';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, User, Parent, Schedule, Course, Class, Classroom, LearningMaterial, Enrollment]),
    UsersModule,
    AuthModule,
    ConfigModule,
    LearningMaterialsModule,
    EnrollmentModule
    
  ],
  providers: [StudentsService, ScheduleService, CourseService, ClassService, ClassroomService, LearningMaterialsService],
  controllers: [StudentController],
  exports: [StudentsService],
})
export class StudentsModule {}