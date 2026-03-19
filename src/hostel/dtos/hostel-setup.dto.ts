import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { HostelRoomNamingMode } from '../entities/hostel-setup.entity';

export class UpdateHostelSetupDto {
  @IsOptional()
  @IsString()
  @IsIn([
    HostelRoomNamingMode.MANUAL,
    HostelRoomNamingMode.NUMERIC,
    HostelRoomNamingMode.ALPHABETICAL,
  ])
  roomNamingMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numericPrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  defaultFloor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultRoomCapacity?: number;
}
