import { 
  IsNotEmpty, 
  IsString, 
  IsEmail, 
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum
} from 'class-validator';
import { Role } from '../enums/role.enum';

export class CreateTeacherDto {
  // Teacher Fields
  @IsNotEmpty({ message: 'firstName should not be empty' })
  @IsString({ message: 'firstName must be a string' })
  firstName: string;

  @IsNotEmpty({ message: 'lastName should not be empty' })
  @IsString({ message: 'lastName must be a string' })
  lastName: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsString()
  subjectSpecialization?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: Date;

  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;

  @IsOptional()
  @IsString()
  status?: string;

  // User Fields (Required)
  @IsNotEmpty({ message: 'username should not be empty' })
  @IsString({ message: 'username must be a string' })
  username: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email' })
  email?: string;

  @IsNotEmpty({ message: 'password should not be empty' })
  @IsString({ message: 'password must be a string' })
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role = Role.TEACHER; // Default to TEACHER
}