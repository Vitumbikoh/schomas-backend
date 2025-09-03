import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

// Utility transformer to split comma separated strings into arrays
const toStringArray = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
};

const toNumberArray = ({ value }: { value: any }) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => Number(v));
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map((v) => Number(v));
};

export class GradesReportQueryDto {
  // Accept internal student UUIDs or external studentId codes. We'll resolve both.
  @IsOptional()
  @IsArray()
  @Transform(toStringArray)
  studentIds?: string[];

  @IsOptional()
  @IsString()
  classId?: string;

  // Direct filtering by term IDs
  @IsOptional()
  @IsArray()
  @Transform(toStringArray)
  termIds?: string[];

  // Provide academic calendar and optionally termNumbers to derive term IDs
  @IsOptional()
  @IsString()
  academicCalendarId?: string;

  @IsOptional()
  @IsArray()
  @Transform(toNumberArray)
  termNumbers?: number[]; // e.g. 1,2,3

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  combineTerms?: boolean = false;

  // Alias used by frontend (aggregateTerms) -> will OR with combineTerms in service
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  aggregateTerms?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeTermBreakdown?: boolean = true;

  // Allow admins (or explicit request) to see unpublished term grades
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeUnpublished?: boolean = false;
}
