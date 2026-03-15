import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
