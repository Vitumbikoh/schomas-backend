import { IsString, IsInt, Min, Max, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateGradeFormatDto {
  @IsString() grade: string;
  @IsString() description: string;
  @IsInt() @Min(0) @Max(100) minPercentage: number;
  @IsInt() @Min(0) @Max(100) maxPercentage: number;
  @IsNumber() gpa: number;
  @IsOptional() @IsBoolean() isActive?: boolean = true;
}

export class UpdateGradeFormatDto {
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) minPercentage?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) maxPercentage?: number;
  @IsOptional() @IsNumber() gpa?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class InitializeGradeFormatsDto {
  formats: CreateGradeFormatDto[];
}
