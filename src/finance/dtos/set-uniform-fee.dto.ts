import { IsUUID, IsNumber, IsPositive, IsBoolean, IsOptional } from 'class-validator';

export class SetUniformFeeDto {
  @IsUUID()
  TermId: string; // Represents the specific period (Term row with period relation)

  @IsNumber()
  @IsPositive()
  amount: number; // Base expected fee each student must pay for the period

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean; // Whether to overwrite existing expectations
}
