// src/exams/dto/create-exam.dto.ts
import { IsNotEmpty, IsNumber, IsString, IsOptional, IsUUID } from 'class-validator';

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
  @IsUUID()
  classId: string;

  @IsNotEmpty()
  @IsUUID()
  teacherId: string;

  @IsOptional()
  status?: 'upcoming' | 'administered' | 'graded' = 'upcoming';

  @IsOptional()
  studentsEnrolled?: number = 0;

  @IsOptional()
  studentsCompleted?: number = 0;

  // @IsNotEmpty()
  // @IsUUID()
  // TermId: string; // Changed from Term to TermId

  @IsNotEmpty()
  @IsUUID()
  courseId: string;
}