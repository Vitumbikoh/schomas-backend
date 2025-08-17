import { IsUUID, IsNumber, IsPositive, IsBoolean, IsOptional } from 'class-validator';

export class SetUniformFeeDto {
  @IsUUID()
  academicYearId: string; // Represents the specific term (AcademicYear row with term relation)

  @IsNumber()
  @IsPositive()
  amount: number; // Base expected fee each student must pay for the term

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean; // Whether to overwrite existing expectations
}
