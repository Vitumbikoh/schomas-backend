
import { PartialType } from '@nestjs/mapped-types/dist/partial-type.helper';
import { IsOptional, IsString, IsDateString } from 'class-validator';
import { CreateFinanceDto } from 'src/user/dtos/create-finance.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;
}

export class UpdateFinanceDto extends PartialType(CreateFinanceDto) {
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
  department?: string;
}