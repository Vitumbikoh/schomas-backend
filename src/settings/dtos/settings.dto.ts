import { IsString, IsEmail, IsOptional, IsBoolean, IsObject, ValidateNested } from 'class-validator';
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
}

export class SettingsResponseDto {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    phone?: string;
    image?: string;
    notifications: {
      email: boolean;
      sms: boolean;
      browser: boolean;
      weeklySummary: boolean;
    };
    security: {
      twoFactor: boolean;
    };
  };
  schoolSettings?: {
    schoolName: string;
    schoolEmail: string;
    schoolPhone: string;
    schoolAddress: string;
    schoolAbout: string;
  };
}