import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningMaterialsService } from './learning-materials.service';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { User } from 'src/user/entities/user.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { LearningMaterial } from './entities/learning-material.entity';
import { LearningMaterialsController } from './learning-materials.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningMaterial, Class, Course, User, Teacher]),
  ],
  providers: [LearningMaterialsService],
  controllers: [LearningMaterialsController],
})
export class LearningMaterialsModule {}