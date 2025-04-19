import { PartialType } from '@nestjs/mapped-types/dist/partial-type.helper';
import { IsOptional, IsString, IsDateString } from 'class-validator';
import { CreateParentDto } from 'src/user/dtos/create-parent.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;
}

export class UpdateParentDto extends PartialType(CreateParentDto) {
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
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  occupation?: string;
}