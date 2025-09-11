import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';

export class SetSchoolBillingPlanDto {
  @IsOptional()
  @IsString()
  schoolId?: string; // required when SUPER_ADMIN; for ADMIN ignored and taken from token
  
  @IsNumber()
  ratePerStudent: number;
  
  @IsOptional()
  @IsString()
  currency?: string;
  
  @IsOptional()
  @IsIn(['per_term', 'per_academic_year'])
  cadence?: 'per_term' | 'per_academic_year';
  
  @IsOptional()
  @IsString()
  effectiveFrom?: string; // ISO
}
