import { IsNotEmpty, IsUUID, IsObject } from 'class-validator';

export class SubmitGradesDto {
  @IsNotEmpty()
  @IsUUID()
  examId: string;

  @IsNotEmpty()
  @IsObject()
  grades: Record<string, number>;
}