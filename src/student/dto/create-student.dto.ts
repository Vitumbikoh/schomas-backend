// import { IsString, IsEmail, IsNotEmpty, IsOptional, IsDateString, IsNumberString } from 'class-validator';
// import { Role } from '../../user/enums/role.enum';
// import { Transform } from 'class-transformer';

// export class CreateStudentDto {
//   @IsNotEmpty()
//   @IsString()
//   username: string;

//   @IsNotEmpty()
//   @IsEmail()
//   email: string;

//   @IsNotEmpty()
//   @IsString()
//   password: string;

//   @IsNotEmpty()
//   @IsString()
//   firstName: string;

//   @IsNotEmpty()
//   @IsString()
//   lastName: string;

//   @IsOptional()
//   @IsString()
//   phoneNumber?: string;

//   @IsOptional()
//   @IsString()
//   address?: string;

//   @IsOptional()
//   @IsDateString()
//   @Transform(({ value }) => value ? new Date(value).toISOString() : null)
//   dateOfBirth?: string;

//   @IsOptional()
//   @IsString()
//   gender?: string;

//   @IsOptional()
//   @IsString()
//   gradeLevel?: string;

//   @IsOptional()
//   @IsNumberString()
//   parentId?: string;
// }