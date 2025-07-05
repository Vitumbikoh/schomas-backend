import { IsString, IsNumber, IsDateString, IsOptional, IsEnum } from 'class-validator';

export class ProcessPaymentDto {
  @IsString()
  studentId: string;

  @IsString()
  paymentType: string;

  @IsNumber()
  amount: number;

  @IsDateString()
  paymentDate: string;

  @IsEnum(['cash', 'bank_transfer'])
  paymentMethod: 'cash' | 'bank_transfer';

  @IsString()
  @IsOptional()
  receiptNumber?: string | null;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsString()
  userId: string;
}