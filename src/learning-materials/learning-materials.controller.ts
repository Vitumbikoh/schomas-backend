import { Controller, Get, Post, Param, Body, Request, UseGuards, UseInterceptors, UploadedFile, ValidationPipe } from '@nestjs/common';
import { LearningMaterialsService } from './learning-materials.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { CreateLearningMaterialDto } from './dtos/create-learning-material.dto';
import { LearningMaterial } from './entities/learning-material.entity';
import { File as MulterFile } from 'multer';

@Controller('api/v1/teacher')
@UseGuards(JwtAuthGuard)
export class LearningMaterialsController {
  constructor(private readonly learningMaterialsService: LearningMaterialsService) {}

  @Get('classes')
  async getClasses(@Request() req): Promise<Class[]> {
    console.log('JWT user:', req.user);
    return this.learningMaterialsService.getClassesForTeacher(req.user.sub);
  }

  @Get('courses/by-class/:classId')
  async getCoursesForClass(@Request() req, @Param('classId') classId: string): Promise<Course[]> {
    console.log('JWT user:', req.user);
    console.log('Class ID:', classId);
    return this.learningMaterialsService.getCoursesForClass(req.user.sub, classId);
  }

  @Post('learning-materials')
  @UseInterceptors(FileInterceptor('file', LearningMaterialsService.storageOptions))
  async createLearningMaterial(
    @Body(new ValidationPipe()) createLearningMaterialDto: CreateLearningMaterialDto,
    @UploadedFile() file: MulterFile,
    @Request() req,
  ): Promise<LearningMaterial> {
    console.log('JWT user:', req.user);
    return this.learningMaterialsService.createLearningMaterial(createLearningMaterialDto, file, req.user.sub);
  }
}