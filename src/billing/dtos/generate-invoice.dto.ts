import { IsOptional, IsUUID, IsString } from 'class-validator';

export class GenerateInvoiceDto {
  // One of
  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  academicCalendarId?: string;

  // SUPER_ADMIN may target a specific school
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  // Optional overrides
  @IsOptional()
  @IsString()
  dueDate?: string; // ISO date

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordBillingPaymentDto {
  invoiceId: string;
  amount: number;
  method?: 'manual' | 'bank_transfer';
  reference?: string;
}
