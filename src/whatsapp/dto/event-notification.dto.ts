import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EventNotificationDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsOptional()
  @IsString()
  studentName?: string;

  @IsOptional()
  @IsString()
  customMessage?: string;
}
