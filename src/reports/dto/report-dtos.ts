export interface StudentsReportItem {
  id: string;
  studentId?: string | null;
  studentHumanId?: string | null; // alias / explicit human readable ID
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  grade?: string | null;
  classId?: string | null;
  className?: string | null;
  gender?: string | null;
  enrollmentDate?: Date | string | null;
  status?: string | null;
  age?: number | null;
  parentName?: string | null;
  address?: string | null;
  dateOfBirth?: Date | string | null;
  owesBooks?: string | null; // YES / NO placeholder (can be computed via library borrowings later)
}

export interface TeachersReportItem {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  gender?: string | null;
  subjectSpecialization?: string | null;
  status?: string | null;
  classId?: string | null;
  className?: string | null;
  phoneNumber?: string | null;
  qualification?: string | null;
  yearsOfExperience?: number | null;
  address?: string | null;
  dateOfBirth?: Date | string | null;
  hireDate?: Date | string | null; // canonical
  joinDate?: Date | string | null; // alias for backward compatibility in exports
}

export interface CoursesReportItem {
  id: string;
  name: string;
  code?: string | null;
  classId?: string | null;
  className?: string | null;
  teacherId?: string | null;
  teacherName?: string | null;
  department?: string | null;
  credits?: number | null;
  enrollmentCount?: number | null;
  status?: string | null; // raw status string e.g. active/inactive/upcoming
  active?: boolean | null; // convenience boolean derived from status
}

export interface EnrollmentsReportItem {
  id: string;
  enrollmentDate?: Date | string | null;
  status?: string | null;
  studentId?: string | null;
  studentHumanId?: string | null;
  studentName?: string | null;
  classId?: string | null;
  className?: string | null;
  courseId?: string | null;
  courseName?: string | null;
  teacherId?: string | null;
  teacherName?: string | null;
  termId?: string | null;
  termName?: string | null;
  academicCalendarId?: string | null;
  academicYearName?: string | null;
}

export interface FeePaymentsReportItem {
  id: string;
  studentId?: string | null;
  studentHumanId?: string | null;
  studentName?: string | null;
  classId?: string | null;
  className?: string | null;
  amount: number;
  paymentType?: string | null;
  paymentMethod?: string | null;
  status?: string | null;
  paymentDate?: Date | string | null;
  termId?: string | null;
  termName?: string | null;
  academicCalendarId?: string | null;
}

export interface ComprehensiveReportDTO {
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  totalEnrollments: number;
  totalFeePayments: number;
  totalRevenue: number;
  studentsByGrade: Array<{ grade: string; count: number }>;
  enrollmentsByMonth: Array<{ month: string; count: number }>;
  paymentsByMonth: Array<{ month: string; amount: number }>;
  coursePopularity: Array<{ courseName: string; enrollments: number }>;
  students: StudentsReportItem[];
  teachers: TeachersReportItem[];
  courses: CoursesReportItem[];
  enrollments: EnrollmentsReportItem[];
  feePayments: FeePaymentsReportItem[];
  recentActivities: Array<{ id: string; type: string; description: string; date: string }>; 
  schoolInfo?: {
    school?: any;    // School entity
    settings?: any;  // SchoolSettings entity (can be null)
  } | null;
}
