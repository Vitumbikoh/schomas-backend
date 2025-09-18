import { PartialType } from '@nestjs/swagger';
import { CreateStaffDto } from './create-staff.dto';
import { IsOptional, IsEnum, IsArray, IsString, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @ApiProperty({ description: 'Staff member status', required: false })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'suspended'])
  status?: string;

  @ApiProperty({ description: 'Subjects (for teachers)', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjects?: string[];

  @ApiProperty({ description: 'Years of experience', required: false })
  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;

  @ApiProperty({ description: 'Salary', required: false })
  @IsOptional()
  @IsNumber()
  salary?: number;

  @ApiProperty({ description: 'Department', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ description: 'Can approve budgets (for finance)', required: false })
  @IsOptional()
  @IsBoolean()
  canApproveBudgets?: boolean;

  @ApiProperty({ description: 'Can process payments (for finance)', required: false })
  @IsOptional()
  @IsBoolean()
  canProcessPayments?: boolean;
}