import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UserQueryDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;

  @IsString()
  @IsNotEmpty()
  messageType: string;
}
