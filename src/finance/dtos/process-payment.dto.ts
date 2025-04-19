// src/finance/dto/process-payment.dto.ts
import { IsUUID, IsNumber, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ProcessPaymentDto {
  @IsUUID()
  studentId: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsNotEmpty()
  referenceNumber: string;

  @IsString()
  @IsOptional()
  notes?: string;
}