// src/course/dto/create-course.dto.ts
import { 
  IsString, 
  IsNotEmpty, 
  IsOptional, 
  IsDateString,
  IsIn,
  IsUUID
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsIn(['active', 'inactive', 'upcoming'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'upcoming';

  @IsDateString()
  @IsOptional()
  startDate?: Date;

  @IsDateString()
  @IsOptional()
  endDate?: Date;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsString()
  @IsOptional()
  schedule?: string;
}