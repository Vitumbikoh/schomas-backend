import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class CreateClassroomDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsNotEmpty()
  @IsNumber()
  capacity: number;

  @IsOptional()
  @IsString()
  building?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  amenities?: string[];
}

export class UpdateClassroomDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsString()
  building?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  amenities?: string[];
}

export class ClassroomResponseDto {
  id: string;
  name: string;
  code: string;
  capacity: number;
  building: string;
  floor: string;
  isActive: boolean;
  description: string;
  amenities: string[];
  createdAt: Date;
  updatedAt: Date;
}