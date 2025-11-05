import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateBookDto {
  @IsString() @IsNotEmpty()
  title: string;

  @IsOptional() @IsString()
  author?: string;

  @IsOptional() @IsString()
  isbn?: string;

  @IsInt() @Min(0)
  totalCopies: number;

  @IsOptional() @IsUUID()
  classId?: string;
}

export class UpdateBookDto {
  @IsOptional() @IsString()
  title?: string;

  @IsOptional() @IsString()
  author?: string;

  @IsOptional() @IsString()
  isbn?: string;

  @IsOptional() @IsInt() @Min(0)
  totalCopies?: number;

  @IsOptional() @IsUUID()
  classId?: string;
}
