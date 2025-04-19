
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber,IsString } from 'class-validator';


export class GenerateReceiptDto {
  @IsNotEmpty()
  @IsString()
  referenceNumber: string;

  @IsNotEmpty()
  @Transform(({ value }) => new Date(value))
  processedAt: Date;

  @IsNotEmpty()
  @IsString()
  studentName: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  status: string;
}