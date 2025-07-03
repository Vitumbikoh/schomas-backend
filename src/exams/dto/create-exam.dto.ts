import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateExamDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  examType: string;

  @IsNotEmpty()
  @IsNumber()
  totalMarks: number;

  @IsNotEmpty()
  @IsString()
  date: string;

  @IsNotEmpty()
  @IsString()
  duration: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsNotEmpty()
  @IsString()
  classId: string;

  @IsNotEmpty()
  @IsString()
  teacherId: string;

  @IsOptional()
  status?: 'upcoming' | 'administered' | 'graded' = 'upcoming';

  @IsOptional()
  studentsEnrolled?: number = 0;

  @IsOptional()
  studentsCompleted?: number = 0;

  @IsNotEmpty()
  @IsString()
  academicYear: string;

  @IsNotEmpty()
  @IsString()
  courseId: string;
}