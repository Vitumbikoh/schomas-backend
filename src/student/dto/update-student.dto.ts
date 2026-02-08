import { PartialType } from '@nestjs/mapped-types/dist/partial-type.helper';
import { IsOptional, IsString, IsDateString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateStudentDto } from 'src/user/dtos/create-student.dto';
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
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
    @IsDateString()
    @Transform(({ value }) => value ? new Date(value).toISOString() : null)
    dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  gradeLevel?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  // Optional inactivation control
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  inactivationReason?: string;
}