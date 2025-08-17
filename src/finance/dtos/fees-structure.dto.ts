export class CreateFeeStructureDto {
  academicYearId: string;
  feeType: string;
  amount: number;
  isOptional?: boolean;
  frequency?: string;
  classId?: string;
  isActive?: boolean;
}