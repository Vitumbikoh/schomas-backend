import { IsString, IsOptional, IsDateString, IsBoolean } from 'class-validator';
import { Matches } from 'class-validator';

export class AcademicCalendarDto {
  @IsOptional()
  id?: string;

  @IsString()
  @Matches(/^\d{4}-\d{4}$/, { 
    message: 'Term must be in YYYY-YYYY format' 
  })
  term: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}