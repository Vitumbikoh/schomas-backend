import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateHostelAllocationDto {
  @IsUUID()
  studentId: string;

  @IsUUID()
  hostelId: string;

  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bedNumber?: string;

  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReleaseHostelAllocationDto {
  @IsOptional()
  @IsDateString()
  releasedAt?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason?: string;
}

export class ReleaseAllHostelAllocationsDto {
  @IsOptional()
  @IsUUID()
  hostelId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason?: string;
}
