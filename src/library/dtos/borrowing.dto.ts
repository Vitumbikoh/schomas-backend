import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class BorrowBookDto {
  // Either bookId or bookName must be provided
  @IsOptional() @IsUUID()
  bookId?: string;

  @IsOptional() @IsString()
  bookName?: string;

  @IsUUID()
  studentId: string;

  @IsDateString()
  dueAt: string; // ISO date
}

export class ReturnBookDto {
  @IsUUID()
  borrowingId: string;

  @IsOptional()
  @IsDateString()
  returnedAt?: string;
}
