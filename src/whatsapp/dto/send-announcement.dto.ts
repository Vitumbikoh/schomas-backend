import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];
}
