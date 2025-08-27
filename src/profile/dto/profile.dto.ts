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
  email: string;
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
}
