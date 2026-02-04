import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min, IsEnum } from 'class-validator';

export class GraduatePaymentDto {
  @ApiProperty({ description: 'Payment amount' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Payment method', enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'] })
  @IsString()
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'Specific term to allocate payment to' })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiPropertyOptional({ description: 'Payment notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Receipt number' })
  @IsOptional()
  @IsString()
  receiptNumber?: string;
}

export class WaiveGraduateFeeDto {
  @ApiProperty({ description: 'Amount to waive' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Reason for waiving fees' })
  @IsString()
  reason: string;
}

export class GraduateFiltersDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @IsNumber()
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by payment status' })
  @IsOptional()
  @IsEnum(['outstanding', 'partial', 'paid', 'waived'])
  status?: 'outstanding' | 'partial' | 'paid' | 'waived';

  @ApiPropertyOptional({ description: 'Search by name or student ID' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by graduation year (YYYY)' })
  @IsOptional()
  @IsString()
  graduationYear?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;
}

export class GraduateSummaryDto {
  totalGraduates: number;
  graduatesWithBalance: number;
  totalOutstanding: number;
  totalPaid: number;
  totalExpected: number;
  byStatus: {
    outstanding: number;
    partial: number;
    paid: number;
    waived: number;
  };
  byYear: Array<{
    year: string;
    count: number;
    outstanding: number;
  }>;
}

export class GraduateDetailDto {
  id: string;
  student: {
    id: string;
    studentId: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  totalExpected: number;
  totalPaid: number;
  outstandingAmount: number;
  paymentStatus: string;
  graduatedAt: Date;
  graduationClass: string;
  termBreakdown: Array<{
    termId: string;
    termNumber: number;
    academicYear: string;
    expected: number;
    paid: number;
    outstanding: number;
  }>;
  paymentHistory: Array<{
    id: string;
    amount: number;
    paymentDate: Date;
    paymentMethod: string;
    receiptNumber: string;
    notes: string;
  }>;
  lastPaymentDate: Date;
  lastPaymentAmount: number;
  notes: string;
  paymentPlan: string;
}
