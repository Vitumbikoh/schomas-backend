// term-period.dto.ts
import { IsBoolean, IsDateString, IsUUID, IsInt, Min, Max, IsOptional } from 'class-validator';

export class TermPeriodDto {
  @IsUUID()
  id: string;

  @IsUUID()
  schoolId: string;

  @IsUUID()
  periodId: string;

  periodName: string;

  @IsUUID()
  academicCalendarId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsBoolean()
  isCurrent: boolean;

  @IsBoolean()
  isCompleted: boolean;

  @IsInt()
  @Min(1)
  @Max(3)
  termNumber: number;

  term: string; // The academic calendar term (e.g., "2024-2025")
}

export class CreateTermPeriodDto {
  @IsUUID(undefined, { message: 'periodId must be a valid UUID' })
  periodId: string;

  @IsDateString({}, { message: 'startDate must be a valid date string' })
  startDate: string;

  @IsDateString({}, { message: 'endDate must be a valid date string' })
  endDate: string;

  @IsBoolean({ message: 'isCurrent must be a boolean value' })
  isCurrent: boolean;

  @IsOptional()
  @IsInt({ message: 'termNumber must be an integer' })
  @Min(1, { message: 'termNumber must be at least 1' })
  @Max(3, { message: 'termNumber must be at most 3' })
  termNumber?: number;
}
