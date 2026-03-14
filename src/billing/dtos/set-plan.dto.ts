import { IsOptional, IsString, IsNumber, IsIn, IsObject } from 'class-validator';

export class PackagePricingDto {
  @IsOptional()
  @IsNumber()
  normal?: number;

  @IsOptional()
  @IsNumber()
  silver?: number;

  @IsOptional()
  @IsNumber()
  golden?: number;
}

export class SetSchoolBillingPlanDto {
  @IsOptional()
  @IsString()
  schoolId?: string; // required when SUPER_ADMIN; for ADMIN ignored and taken from token
  
  @IsOptional()
  @IsNumber()
  ratePerStudent?: number;

  @IsOptional()
  @IsIn(['per_student', 'package'])
  planType?: 'per_student' | 'package';
  
  @IsOptional()
  @IsIn(['MWK', 'USD'])
  currency?: 'MWK' | 'USD';
  
  @IsOptional()
  @IsIn(['monthly', 'per_term', 'per_academic_year'])
  cadence?: 'monthly' | 'per_term' | 'per_academic_year';

  @IsOptional()
  @IsObject()
  packagePricing?: PackagePricingDto;
  
  @IsOptional()
  @IsString()
  effectiveFrom?: string; // ISO
}
