export class SchoolAdminCredentialsDto {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  username: string;
  email?: string | null;
  password: string;
  isActive: boolean;
  passwordChanged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SchoolAdminCredentialsListDto {
  credentials: SchoolAdminCredentialsDto[];
  total: number;
  page: number;
  limit: number;
}
