import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum } from 'class-validator';

export enum PayComponentType {
  BASIC = 'BASIC',
  ALLOWANCE = 'ALLOWANCE',
  DEDUCTION = 'DEDUCTION',
  EMPLOYER_CONTRIBUTION = 'EMPLOYER_CONTRIBUTION',
}

export class CreatePayComponentDto {
  @IsString()
  name: string;

  @IsEnum(PayComponentType)
  type: PayComponentType;

  @IsBoolean()
  isFixed: boolean;

  @IsNumber()
  defaultAmount: number;

  @IsOptional()
  @IsString()
  formula?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;
}

export class UpdatePayComponentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(PayComponentType)
  type?: PayComponentType;

  @IsOptional()
  @IsBoolean()
  isFixed?: boolean;

  @IsOptional()
  @IsNumber()
  defaultAmount?: number;

  @IsOptional()
  @IsString()
  formula?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}