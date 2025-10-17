import { AssessmentComponentType } from './entities';

export interface CreateOrUpdateSchemeDto {
  courseId: string;
  termId: string;
  passThreshold?: number;
  components: { componentType: AssessmentComponentType; weight: number; required?: boolean }[];
}

export interface CreateOrUpdateDefaultSchemeDto {
  passThreshold?: number;
  components: { componentType: AssessmentComponentType; weight: number; required?: boolean }[];
}

export interface RecordExamGradeDto {
  examId: string;
  studentId: string;
  rawScore: number;
}
