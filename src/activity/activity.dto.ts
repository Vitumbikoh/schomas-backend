import { ApiProperty } from '@nestjs/swagger';

export class ActivityDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  performedBy: {
    id?: string;
    email: string;
    role: string;
  };

  @ApiProperty({ required: false })
  studentCreated?: {
    id: string;
    fullName: string;
  };

  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty()
  userAgent: string;
}