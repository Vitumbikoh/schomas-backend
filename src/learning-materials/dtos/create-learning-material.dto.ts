import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';

export class CreateLearningMaterialDto {
  @IsUUID()
  @IsNotEmpty()
  classId: string;

  @IsUUID()
  @IsNotEmpty()
  courseId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;
}