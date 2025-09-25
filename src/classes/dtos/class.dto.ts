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
}

export class ClassResponseDto {
  id: string;
  name: string;
  numericalName: number;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
