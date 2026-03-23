import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssetAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  assetId: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  assignedLocation?: string;

  @IsOptional()
  @IsString()
  assignedDepartment?: string;

  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferAssetAssignmentDto {
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  assignedLocation?: string;

  @IsOptional()
  @IsString()
  assignedDepartment?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReleaseAssetAssignmentDto {
  @IsOptional()
  @IsString()
  releaseReason?: string;
}
