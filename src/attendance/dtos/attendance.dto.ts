import { IsString, IsNotEmpty, IsObject, IsDateString } from 'class-validator';

export class CreateAttendanceDto {
  @IsString()
  @IsNotEmpty({ message: 'Class ID is required' })
  classId: string;

  @IsString()
  @IsNotEmpty({ message: 'Course ID is required' })
  courseId: string;

  @IsDateString({}, { message: 'Valid date is required' })
  @IsNotEmpty({ message: 'Date is required' })
  date: string;

  @IsObject()
  @IsNotEmpty({ message: 'Attendance status is required' })
  attendanceStatus: Record<string, boolean>;
}

export class AttendanceResponseDto {
  id: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
  };
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
  };
  course: {
    id: string;
    name: string;
  };
  class: {
    id: string;
    name: string;
  };
  isPresent: boolean;
  date: string;
}