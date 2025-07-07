import { IsString, IsEmail, IsOptional, IsBoolean, IsObject, ValidateNested, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationSettingsDto {
  @IsBoolean()
  email: boolean;

  @IsBoolean()
  sms: boolean;

  @IsBoolean()
  browser: boolean;

  @IsBoolean()
  weeklySummary: boolean;
}

export class SecuritySettingsDto {
  @IsBoolean()
  twoFactor: boolean;
}

export class SchoolSettingsDto {
  @IsString()
  schoolName: string;

  @IsEmail()
  schoolEmail: string;

  @IsString()
  schoolPhone: string;

  @IsString()
  schoolAddress: string;

  @IsString()
  schoolAbout: string;
}

export class UserSettingsDto {
  @IsString()
  id: string;

  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  role: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications: NotificationSettingsDto;

  @ValidateNested()
  @Type(() => SecuritySettingsDto)
  security: SecuritySettingsDto;
}

export class SettingsResponseDto {
  @ValidateNested()
  @Type(() => UserSettingsDto)
  user: UserSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolSettingsDto)
  schoolSettings?: SchoolSettingsDto;
}

export class UpdateSettingsDto {
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
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SecuritySettingsDto)
  security?: SecuritySettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolSettingsDto)
  schoolSettings?: SchoolSettingsDto;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Current password must be at least 6 characters long' })
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword?: string;
}