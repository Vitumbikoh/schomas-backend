// term-period.dto.ts
import { IsBoolean, IsDateString, IsUUID } from 'class-validator';

export class TermPeriodDto {
  @IsUUID()
  id: string;

  @IsUUID()
  periodId: string;

  periodName: string;  // Add this line

  @IsUUID()
  academicCalendarId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsBoolean()
  isCurrent: boolean;
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
}
