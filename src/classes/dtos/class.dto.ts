// class.dto.ts
import { IsString, IsInt, Min, IsOptional } from 'class-validator';

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
export class ClassResponseDto {
  id: string;
  name: string;
  numericalName: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
