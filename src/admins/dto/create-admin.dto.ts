import { IsEmail, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class CreateAdminDto {
  @IsNotEmpty()
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @MinLength(6)
  password: string;
}
