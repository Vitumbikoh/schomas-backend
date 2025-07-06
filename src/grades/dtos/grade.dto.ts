// grade.dto.ts
import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateGradeDto {
  @IsString()
  @IsNotEmpty()
  classId: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsString()
  @IsNotEmpty()
  assessmentType: string;

  @IsObject()
  @IsNotEmpty()
  grades: Record<string, number>; // or string if grades can be letter grades
}