import { IsString, IsNumber, IsEnum, IsOptional, IsDateString, IsArray, IsUUID, Min, Max, MaxLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ExpenseCategory, ExpenseStatus, ExpensePriority } from '../entities/expense.entity';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  budgetCode?: string;

  @IsEnum(ExpensePriority)
  @IsOptional()
  priority?: ExpensePriority = ExpensePriority.MEDIUM;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsUUID()
  schoolId?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  budgetCode?: string;

  @IsOptional()
  @IsEnum(ExpensePriority)
  priority?: ExpensePriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsUUID()
  schoolId?: string;
}

export class ApproveExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  approvedAmount?: number;
}

export class RejectExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;
}

export class ExpenseFiltersDto {
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsEnum(ExpensePriority)
  priority?: ExpensePriority;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value ? parseInt(value, 10) : 0)
  @IsNumber()
  @Min(0)
  page?: number = 0;

  @IsOptional()
  @Transform(({ value }) => value ? parseInt(value, 10) : 20)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ExpenseAnalyticsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;
}

export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}
