import { IsOptional, IsString, Matches, IsArray } from 'class-validator';

export class CreateRunDto {
  @IsString()
  @Matches(/^\d{4}\-(0[1-9]|1[0-2])$/, { message: 'period must be YYYY-MM' })
  period: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staffIds?: string[];
}
