// src/finance/dtos/fees-structure.dto.ts
import { IsNumber, IsUUID, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateFeeStructureDto {
  @IsNumber()
  amount: number;

  @IsUUID()
  academicYearId: string;

  @IsString()
  @IsOptional()
  feeType?: string = 'Tuition'; // Default to 'Tuition' if not provided

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true; // Default to true if not provided

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean = false; // Default to false if not provided

  @IsString()
  @IsOptional()
  frequency?: string = 'per_term'; // Default frequency

  @IsUUID()
  @IsOptional()
  classId?: string; // Optional class-specific fee
}