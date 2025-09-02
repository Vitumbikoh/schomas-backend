import { IsUUID, IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';

export class CreateTermHolidayDto {
  @IsString()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class UpdateTermHolidayDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export interface TermHolidayDto {
  id: string;
  termId: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}
