
import { PartialType } from '@nestjs/mapped-types/dist/partial-type.helper';
import { IsOptional, IsString, IsDateString } from 'class-validator';
import { CreateTeacherDto } from 'src/user/dtos/create-teacher.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;  
}

export class UpdateTeacherDto extends PartialType(CreateTeacherDto) {
  @IsOptional()
  user?: UpdateUserDto;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

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
}