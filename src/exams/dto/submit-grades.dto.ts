import { IsNotEmpty, IsString, IsObject, IsEnum } from 'class-validator';

export enum AssessmentType {
  MIDTERM = 'midterm',
  ENDTERM = 'endterm',
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
  PRACTICAL = 'practical',
}

export class SubmitGradesDto {
  @IsNotEmpty()
  @IsString()
  classId: string;

  @IsNotEmpty()
  @IsString()
  course: string;

  @IsNotEmpty()
  @IsEnum(AssessmentType)
  assessmentType: AssessmentType;

  @IsNotEmpty()
  @IsString()
  assessmentTitle: string;

  @IsNotEmpty()
  @IsObject()
  grades: Record<string, string>;
}