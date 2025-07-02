export class CreateExamDto {
  title: string;
  subject: string;
  class: string;
  teacher: string;
  date: string;
  duration: string;
  totalMarks: number;
  status: 'upcoming' | 'administered' | 'graded';
  studentsEnrolled: number;
  studentsCompleted: number;
  academicYear: string;
  description?: string;
  instructions?: string;
  courseId: string;
}