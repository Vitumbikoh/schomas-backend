// src/enrollment/dto/create-enrollment.dto.ts
import { IsUUID } from 'class-validator';

export class CreateEnrollmentDto {
  @IsUUID()
  courseId: string;

  @IsUUID()
  studentId: string;
}