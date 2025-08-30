import { IsEmail, IsNotEmpty, IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Role } from '../enums/role.enum';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsEnum(Role)
  role: Role;

  // Provided only when creating a user under a specific school (ignored for SUPER_ADMIN creation)
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}