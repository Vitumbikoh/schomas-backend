import { IsOptional, IsString, IsEmail, IsDateString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  occupation?: string;
}

export class ProfileResponseDto {
  id: string;
  username: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  school?: {
    id: string;
    name: string;
    code: string;
  } | null;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  studentId?: string;
  address?: string;
  dateOfBirth?: Date;
  gender?: string;
  occupation?: string;
  teacherId?: string;
  createdAt?: string;
  lastLoginAt?: string;
  status?: string;
}

export class ProfileActivityDto {
  id: string;
  action: string;
  date: string;
  description?: string;
}

export class ProfileStatsDto {
  loginCount: number;
  lastLogin: string | null;
  accountAge: number;
  isActive: boolean;
  
  // Teacher stats
  classesCount?: number;
  studentsCount?: number;
  assignmentsCreated?: number;
  averageRating?: number;
  
  // Student stats
  currentGPA?: number;
  attendanceRate?: number;
  assignmentsCompleted?: number;
  activitiesCount?: number;
  
  // Admin stats
  reportsGenerated?: number;
  systemChanges?: number;
  usersManaged?: number;
  
  // Parent stats
  childrenCount?: number;
  meetingsAttended?: number;
  messagesExchanged?: number;
  paymentsCount?: number;
  
  // Finance stats
  transactionsProcessed?: number;
  expensesManaged?: number;
}
