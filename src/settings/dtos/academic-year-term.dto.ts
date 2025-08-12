// academic-year-term.dto.ts
import { IsBoolean, IsDateString, IsUUID } from 'class-validator';

export class AcademicYearTermDto {
  @IsUUID()
  id: string;

  @IsUUID()
  termId: string;

  termName: string;  // Add this line

  @IsUUID()
  academicCalendarId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsBoolean()
  isCurrent: boolean;
}

export class CreateAcademicYearTermDto {
  @IsUUID(undefined, { message: 'termId must be a valid UUID' })
  termId: string;

  @IsDateString({}, { message: 'startDate must be a valid date string' })
  startDate: string;

  @IsDateString({}, { message: 'endDate must be a valid date string' })
  endDate: string;

  @IsBoolean({ message: 'isCurrent must be a boolean value' })
  isCurrent: boolean;
}