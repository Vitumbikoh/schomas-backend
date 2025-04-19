// src/finance/dto/approve-budget.dto.ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApproveBudgetDto {
  @IsBoolean()
  approved: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}