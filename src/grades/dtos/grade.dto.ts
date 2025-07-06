export class CreateGradeDto {
  classId: string;
  courseId: string;
  assessmentType: string;
  grades: Record<string, string>;
}