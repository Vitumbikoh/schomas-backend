// // src/teacher/dto/create-teacher.dto.ts
// import { 
//   IsString, 
//   IsEmail, 
//   IsNotEmpty, 
//   MinLength, 
//   IsDate, 
//   IsOptional, 
//   IsArray, 
//   IsIn, 
//   IsInt, 
//   IsPhoneNumber 
// } from 'class-validator';
// import { Transform } from 'class-transformer';

// export class CreateTeacherDto {
//   @IsString()
//   @IsNotEmpty()
//   username: string;

//   @IsEmail()
//   email: string;

//   @IsString()
//   @MinLength(6)
//   password: string;

//   @IsString()
//   @IsNotEmpty()
//   firstName: string;

//   @IsString()
//   @IsNotEmpty()
//   lastName: string;

//   @IsString()
//   @IsNotEmpty()
//   @IsPhoneNumber() 
//   phoneNumber: string;

//   @IsString()
//   @IsNotEmpty()
//   qualification: string;

//   @IsArray()
//   @IsString({ each: true })
//   @IsOptional()
//   specializations?: string[];

//   @IsDate()
//   @Transform(({ value }) => new Date(value))
//   @IsOptional()
//   dateOfBirth?: Date;

//   @IsDate()
//   @Transform(({ value }) => new Date(value))
//   hireDate: Date;

//   @IsInt()
//   @IsOptional()
//   yearsOfExperience?: number;

//   @IsString()
//   @IsIn(['active', 'on_leave', 'inactive'])
//   @IsOptional()
//   status?: 'active' | 'on_leave' | 'inactive';

//   @IsString()
//   @IsOptional()
//   bio?: string;
// }