// src/course/dto/update-course.dto.ts
import { 
  IsString, 
  IsOptional, 
  IsIn,
  IsUUID,
  IsArray,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

class ScheduleDto {
  @IsArray()
  @IsString({ each: true })
  days: string[];

  @IsString()
  time: string;

  @IsString()
  location: string;
}

export class UpdateCourseDto {
  
  @IsString()
  @IsOptional()
  code?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsIn(['active', 'inactive', 'upcoming'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'upcoming';

  @IsOptional()
  enrollmentCount?: number;

  @IsUUID()
  @IsOptional()
  teacherId?: string;

  @ValidateNested()
  @Type(() => ScheduleDto)
  @IsOptional()
  schedule?: ScheduleDto;
}