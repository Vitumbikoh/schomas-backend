import { 
  IsString, 
  IsNotEmpty, 
  IsOptional, 
  IsIn,
  IsUUID
} from 'class-validator';

export class BulkCreateCourseDto {
  @IsString()
  @IsNotEmpty()
  code: string;

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

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsString()
  @IsOptional()
  schedule?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  // Additional field for bulk upload - will be resolved to classId
  @IsString()
  @IsOptional()
  className?: string;

  // Additional field for bulk upload - will be resolved to teacherId
  @IsString()
  @IsOptional()
  teacherName?: string;
}