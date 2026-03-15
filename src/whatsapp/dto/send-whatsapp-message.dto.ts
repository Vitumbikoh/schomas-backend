import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @ValidateIf((dto: SendWhatsAppMessageDto) => !dto.templateName)
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  text?: string;

  @ValidateIf((dto: SendWhatsAppMessageDto) => !dto.text)
  @IsString()
  @IsOptional()
  templateName?: string;

  @IsString()
  @IsOptional()
  languageCode?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsOptional()
  templateVariables?: string[];

  @IsBoolean()
  @IsOptional()
  enforceSessionWindow?: boolean;
}
