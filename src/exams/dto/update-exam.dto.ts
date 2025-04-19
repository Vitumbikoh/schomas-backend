// src/exam/dto/update-exam.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateExamDto } from './create-exam.dto';

export class UpdateExamDto extends PartialType(CreateExamDto) {
  isPublished?: boolean;
}