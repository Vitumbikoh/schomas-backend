import { IsNotEmpty, IsString, IsUUID, IsBoolean, IsOptional, IsIn } from 'class-validator';

// Create/update DTOs are standardized to accept day-of-week and time strings (HH:mm)
// Service will merge with a provided date (optional) or a default reference date.

export class CreateScheduleDto {
  @IsNotEmpty()
  @IsUUID()
  classId: string;

  // Optional calendar date to anchor the time-of-day; if omitted, today's date is used
  @IsOptional()
  @IsString()
  date?: string; // ISO date string (YYYY-MM-DD or ISO)

  @IsNotEmpty()
  @IsString()
  @IsIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
  day: string;

  @IsNotEmpty()
  @IsString()
  startTime: string; // HH:mm

  @IsNotEmpty()
  @IsString()
  endTime: string; // HH:mm

  @IsNotEmpty()
  @IsUUID()
  courseId: string;

  @IsNotEmpty()
  @IsUUID()
  teacherId: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string; // optional room

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
  day?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CloneScheduleDto {
  @IsNotEmpty()
  @IsUUID()
  fromClassId: string;

  @IsNotEmpty()
  @IsUUID()
  toClassId: string;

  @IsOptional()
  overwrite?: boolean;
}

export type WeeklyTimetableResponse = {
  classId: string;
  days: Array<{
    day: string;
    items: Array<{
      id: string;
      startTime: string; // HH:mm
      endTime: string;   // HH:mm
      course: { id: string; name: string };
      teacher: { id: string; name: string };
      classroom?: { id: string; name: string } | null;
    }>;
  }>;
};
