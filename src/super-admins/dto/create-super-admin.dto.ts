import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateSuperAdminDto {
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string; // Still required for super admins

  @MinLength(8)
  password: string;

  // Optional: full name fields (not in User entity yet, would need adding if desired)
  // @IsOptional() firstName?: string;
  // @IsOptional() lastName?: string;
}
