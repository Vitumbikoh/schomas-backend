import { IsString, IsEmail, IsOptional, IsEnum, IsBoolean, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStaffDto {
  @ApiProperty({ description: 'Staff member username' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'Staff member email' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Staff member password' })
  @IsString()
  password: string;

  @ApiProperty({ description: 'Staff member first name' })
  @IsString()
  firstName: string;

  @ApiProperty({ description: 'Staff member last name' })
  @IsString()
  lastName: string;

  @ApiProperty({ description: 'Staff member phone number' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ description: 'Staff member address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Staff member date of birth' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ description: 'Staff member gender' })
  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
  gender?: string;

  @ApiProperty({ description: 'Staff member role', enum: ['teacher', 'admin', 'finance', 'librarian'] })
  @IsEnum(['teacher', 'admin', 'finance', 'librarian'])
  role: string;

  @ApiProperty({ description: 'Department', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ description: 'Hire date', required: false })
  @IsOptional()
  @IsDateString()
  hireDate?: Date;

  @ApiProperty({ description: 'Salary', required: false })
  @IsOptional()
  @IsNumber()
  salary?: number;

  // Teacher-specific fields
  @ApiProperty({ description: 'Qualification (for teachers)', required: false })
  @IsOptional()
  @IsString()
  qualification?: string;

  @ApiProperty({ description: 'Subject specialization (for teachers)', required: false })
  @IsOptional()
  @IsString()
  subjectSpecialization?: string;

  @ApiProperty({ description: 'Years of experience (for teachers)', required: false })
  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;

  // Finance-specific fields
  @ApiProperty({ description: 'Can approve budgets (for finance)', required: false })
  @IsOptional()
  @IsBoolean()
  canApproveBudgets?: boolean;

  @ApiProperty({ description: 'Can process payments (for finance)', required: false })
  @IsOptional()
  @IsBoolean()
  canProcessPayments?: boolean;
}