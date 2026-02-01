import { IsUUID, IsNumber, IsEnum, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AllocationReason } from '../entities/payment-allocation.entity';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Student ID' })
  @IsUUID()
  studentId: string;

  @ApiProperty({ description: 'Payment amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Term when payment was made' })
  @IsUUID()
  termId: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';

  @ApiPropertyOptional({ description: 'Receipt number' })
  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @ApiPropertyOptional({ description: 'Payment notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Auto-allocate to current term', default: true })
  @IsOptional()
  autoAllocateToCurrentTerm?: boolean = true;
}

export class CreatePaymentAllocationDto {
  @ApiProperty({ description: 'Payment ID' })
  @IsUUID()
  paymentId: string;

  @ApiProperty({ description: 'Term ID to allocate payment to' })
  @IsUUID()
  termId: string;

  @ApiProperty({ description: 'Amount to allocate' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ 
    description: 'Reason for allocation',
    enum: AllocationReason
  })
  @IsEnum(AllocationReason)
  reason: AllocationReason;

  @ApiPropertyOptional({ description: 'Allocation notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CarryForwardDto {
  @ApiProperty({ description: 'Source term ID (where balances are carried from)' })
  @IsUUID()
  fromTermId: string;

  @ApiProperty({ description: 'Target term ID (where balances are carried to)' })
  @IsUUID()
  toTermId: string;
}

export class CreateExpectedFeeDto {
  @ApiProperty({ description: 'Academic Calendar ID' })
  @IsUUID()
  academicCalendarId: string;

  @ApiProperty({ description: 'Term ID' })
  @IsUUID()
  termId: string;

  @ApiPropertyOptional({ description: 'Class ID (null for all classes)' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiProperty({ description: 'Fee category' })
  @IsString()
  feeCategory: string;

  @ApiProperty({ description: 'Fee description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Fee amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: 'Is this fee optional?', default: false })
  @IsOptional()
  isOptional?: boolean = false;

  @ApiPropertyOptional({ description: 'Fee frequency', default: 'termly' })
  @IsOptional()
  @IsString()
  frequency?: 'once' | 'monthly' | 'termly' | 'annually' = 'termly';

  @ApiPropertyOptional({ description: 'Number of times this fee applies', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  applicableInstances?: number = 1;
}

export class CreateStudentAcademicRecordDto {
  @ApiProperty({ description: 'Student ID' })
  @IsUUID()
  studentId: string;

  @ApiProperty({ description: 'Academic Calendar ID' })
  @IsUUID()
  academicCalendarId: string;

  @ApiProperty({ description: 'Term ID' })
  @IsUUID()
  termId: string;

  @ApiPropertyOptional({ description: 'Class ID' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ description: 'Student status', default: 'active' })
  @IsOptional()
  @IsString()
  status?: 'active' | 'graduated' | 'transferred' | 'dropped_out' = 'active';

  @ApiPropertyOptional({ description: 'Record notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Is this a promotion record?', default: false })
  @IsOptional()
  isPromotionRecord?: boolean = false;
}

// Response DTOs for better API documentation

export class StudentFeeStatusResponseDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  studentName: string;

  @ApiProperty()
  humanId: string;

  @ApiProperty()
  termId: string;

  @ApiProperty()
  expectedAmount: number;

  @ApiProperty()
  paidAmount: number;

  @ApiProperty()
  outstandingAmount: number;

  @ApiProperty()
  overdueAmount: number;

  @ApiProperty()
  paymentPercentage: number;

  @ApiProperty()
  status: 'paid' | 'partial' | 'unpaid' | 'overpaid';

  @ApiProperty()
  isOverdue: boolean;

  @ApiProperty()
  carryForwardAmount: number;

  @ApiProperty()
  currentTermFees: number;
}

export class TermFinanceSummaryResponseDto {
  @ApiProperty()
  termId: string;

  @ApiProperty()
  termName: string;

  @ApiProperty()
  academicCalendar: string;

  @ApiProperty()
  totalStudents: number;

  @ApiProperty()
  expectedAmount: number;

  @ApiProperty()
  paidAmount: number;

  @ApiProperty()
  outstandingAmount: number;

  @ApiProperty()
  overdueAmount: number;

  @ApiProperty()
  paymentPercentage: number;

  @ApiProperty()
  studentsFullyPaid: number;

  @ApiProperty()
  studentsPartiallyPaid: number;

  @ApiProperty()
  studentsUnpaid: number;

  @ApiProperty()
  studentsOverdue: number;

  @ApiProperty()
  totalCarryForwardAmount: number;

  @ApiProperty()
  currentTermFeesAmount: number;

  @ApiProperty()
  averagePaymentPerStudent: number;

  @ApiProperty()
  isTermCompleted: boolean;

  @ApiProperty()
  termEndDate: Date;
}

export class AllocationSuggestionResponseDto {
  @ApiProperty()
  termId: string;

  @ApiProperty()
  termName: string;

  @ApiProperty()
  suggestedAmount: number;

  @ApiProperty({ enum: AllocationReason })
  reason: AllocationReason;

  @ApiProperty()
  priority: number;

  @ApiProperty()
  description: string;
}

export class CarryForwardSummaryResponseDto {
  @ApiProperty()
  totalStudents: number;

  @ApiProperty()
  totalAmountCarriedForward: number;

  @ApiProperty()
  createdFeeRecords: number;

  @ApiProperty({ type: [Object] })
  balances: any[];
}