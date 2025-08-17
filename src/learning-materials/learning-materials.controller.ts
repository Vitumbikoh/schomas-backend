import { Controller, Post, Body, Request, UseGuards, UseInterceptors, UploadedFile, ValidationPipe, ForbiddenException } from '@nestjs/common';
import { LearningMaterialsService } from './learning-materials.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/user/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { LearningMaterial } from './entities/learning-material.entity';
import { CreateLearningMaterialDto } from './dtos/create-learning-material.dto';
import { Multer } from 'multer';

@Controller('learning-materials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TEACHER)
export class LearningMaterialsController {
  constructor(private readonly learningMaterialsService: LearningMaterialsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: LearningMaterialsService.storageOptions,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  }))
  async createLearningMaterial(
    @Body(ValidationPipe) createLearningMaterialDto: CreateLearningMaterialDto,
    @UploadedFile() file: Multer.File,
    @Request() req,
  ): Promise<{ success: boolean; material: LearningMaterial; message: string }> {
    console.log('Request user:', req.user);
    if (!req.user?.sub) {
      console.error('No user ID found in request');
      throw new ForbiddenException('Invalid user authentication');
    }
    const material = await this.learningMaterialsService.createLearningMaterial(
      createLearningMaterialDto,
      file,
      req.user.sub,
    );
    return {
      success: true,
      material,
      message: 'Learning material uploaded successfully',
    };
  }
}