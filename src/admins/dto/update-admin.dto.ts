// update-admin.dto.ts
import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsEnum } from 'class-validator';
import { Role } from '../../user/enums/role.enum';

export class UpdateAdminDto {
  @IsOptional()
  @IsNotEmpty()
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  image?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}