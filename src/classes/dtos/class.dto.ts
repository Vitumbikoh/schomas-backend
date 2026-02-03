// class.dto.ts
import { IsString, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';

export class CreateClassDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  numericalName: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  numericalName?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  schoolId?: string;
}

export class ClassResponseDto {
  id: string;
  name: string;
  numericalName: number;
  description: string | null;
  isActive: boolean;
  schoolId?: string;
  createdAt: Date;
  updatedAt: Date;
}
