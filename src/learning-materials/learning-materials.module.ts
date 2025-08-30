import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningMaterialsService } from './learning-materials.service';
import { LearningMaterialsController } from './learning-materials.controller';
import { LearningMaterial } from './entities/learning-material.entity';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { User } from 'src/user/entities/user.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Student } from 'src/user/entities/student.entity';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from 'src/config/config.module';
import { CourseModule } from 'src/course/course.module';
import { StudentsModule } from 'src/student/student.module';
import { EnrollmentModule } from 'src/enrollment/enrollment.module';
import { SettingsModule } from 'src/settings/settings.module';
import { LogsModule } from 'src/logs/logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningMaterial,
      Class,
      Course,
      User,
      Teacher,
      Student,
    ]),
    AuthModule,
    ConfigModule,
    forwardRef(() => SettingsModule),
    LogsModule,
    forwardRef(() => CourseModule),
    forwardRef(() => StudentsModule),
    forwardRef(() => EnrollmentModule), // This provides the EnrollmentRepository
  ],
  providers: [LearningMaterialsService],
  controllers: [LearningMaterialsController],
  exports: [LearningMaterialsService],
})
export class LearningMaterialsModule {}