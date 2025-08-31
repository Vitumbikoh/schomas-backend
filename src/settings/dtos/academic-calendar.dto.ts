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

export class AcademicCalendarClosureDto {
  closedCalendarId: string;
  closedCalendarTerm: string;
  newActiveCalendarId: string | null;
  newActiveCalendarTerm: string | null;
  studentsPromoted: number;
  studentsGraduated: number;
  promotionErrors: string[];
  completedTerms: number;
  totalTerms: number;
  message: string;
}