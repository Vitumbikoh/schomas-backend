import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { StudentsService } from '../student/student.service';
import { TeachersService } from '../teacher/teacher.service';
import { CourseService } from '../course/course.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { FinanceService } from '../finance/finance.service';
import { Between } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FeePayment } from '../finance/entities/fee-payment.entity';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('admin/reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ReportsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly teachersService: TeachersService,
    private readonly courseService: CourseService,
    private readonly enrollmentService: EnrollmentService,
    private readonly financeService: FinanceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get comprehensive report data for admin dashboard' })
  @ApiResponse({ status: 200, description: 'Report data retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getReportData(
    @Request() req,
    // Student filters
    @Query('studentAgeFrom') studentAgeFrom?: string,
    @Query('studentAgeTo') studentAgeTo?: string,
    @Query('studentClass') studentClass?: string,
    @Query('studentClassId') studentClassId?: string,
    @Query('studentGender') studentGender?: string,
    // Teacher filters
    @Query('teacherSubjectSpecialization') teacherSubjectSpecialization?: string,
    @Query('teacherAgeFrom') teacherAgeFrom?: string,
    @Query('teacherAgeTo') teacherAgeTo?: string,
    @Query('teacherStatus') teacherStatus?: string,
    @Query('teacherGender') teacherGender?: string,
    @Query('teacherClassId') teacherClassId?: string,
    // Course filters
    @Query('courseClassId') courseClassId?: string,
    @Query('courseTeacherId') courseTeacherId?: string,
    // Enrollment filters
    @Query('enrollmentClassId') enrollmentClassId?: string,
    @Query('enrollmentCourseId') enrollmentCourseId?: string,
    @Query('enrollmentTeacherId') enrollmentTeacherId?: string,
    @Query('enrollmentAcademicCalendarId') enrollmentAcademicCalendarId?: string,
    // Fee payment filters
    @Query('paymentAcademicCalendarId') paymentAcademicCalendarId?: string,
    @Query('paymentStudentId') paymentStudentId?: string,
    @Query('paymentTermId') paymentTermId?: string,
    @Query('paymentClassId') paymentClassId?: string,
  ) {
    try {
      // Build where conditions for students
      const studentWhere: any = {};
      if (studentAgeFrom || studentAgeTo) {
        studentWhere.age = Between(
          parseInt(studentAgeFrom || '0'),
          parseInt(studentAgeTo || '999'),
        );
      }
      if (studentClass) {
        studentWhere.gradeLevel = studentClass;
      }
      if (studentGender) {
        studentWhere.gender = studentGender;
      }

      // Build where conditions for teachers
      const teacherWhere: any = {};
      if (teacherSubjectSpecialization) {
        teacherWhere.subjectSpecialization = teacherSubjectSpecialization;
      }
      if (teacherAgeFrom || teacherAgeTo) {
        teacherWhere.age = Between(
          parseInt(teacherAgeFrom || '0'),
          parseInt(teacherAgeTo || '999'),
        );
      }
      if (teacherStatus) {
        teacherWhere.status = teacherStatus;
      }
      if (teacherGender) {
        teacherWhere.gender = teacherGender;
      }

      const user = req.user;
      const superAdmin = user.role === Role.SUPER_ADMIN;
      // Allow SUPER_ADMIN to optionally query a specific school via ?schoolId
      const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;

      const [students, teachers, courses, enrollments, feePayments] = await Promise.all([
        this.studentsService.findAll(studentWhere, targetSchoolId, superAdmin),
        // Teacher service currently lacks a generic findAll with scoping; use paginated with large limit
        this.teachersService.findAllPaginated(1, 5000, undefined, targetSchoolId, superAdmin).then(r => r[0]),
        this.courseService.findAll({ schoolId: targetSchoolId, superAdmin }),
        this.enrollmentService.findAll(targetSchoolId, superAdmin),
        this.financeService.getAllPayments(1, 1000, '', targetSchoolId, superAdmin),
      ]);

      // Apply controller-level filters for additional fields
      const filteredStudents = students.filter((s: any) => {
        const classIdMatch = studentClassId ? (s.classId === studentClassId || s.class?.id === studentClassId) : true;
        const genderMatch = studentGender ? s.gender === studentGender : true;
        const classNameMatch = studentClass ? (s.gradeLevel === studentClass || s.class?.name === studentClass) : true;
        return classIdMatch && genderMatch && classNameMatch;
      });

      const filteredTeachers = teachers.filter((t: any) => {
        const genderMatch = teacherGender ? t.gender === teacherGender : true;
        const classMatch = teacherClassId ? (t.classId === teacherClassId || t.assignedClass?.id === teacherClassId) : true;
        return genderMatch && classMatch;
      });

      const filteredCourses = courses.filter((c: any) => {
        const classMatch = courseClassId ? (c.classId === courseClassId || c.class?.id === courseClassId) : true;
        const teacherMatch = courseTeacherId ? (c.teacherId === courseTeacherId || c.teacher?.id === courseTeacherId) : true;
        return classMatch && teacherMatch;
      });

      const filteredEnrollments = enrollments.filter((e: any) => {
        const classMatch = enrollmentClassId ? (e.classId === enrollmentClassId || e.class?.id === enrollmentClassId || e.course?.classId === enrollmentClassId || e.course?.class?.id === enrollmentClassId) : true;
        const courseMatch = enrollmentCourseId ? (e.courseId === enrollmentCourseId || e.course?.id === enrollmentCourseId) : true;
        const teacherMatch = enrollmentTeacherId ? (e.teacherId === enrollmentTeacherId || e.course?.teacherId === enrollmentTeacherId || e.course?.teacher?.id === enrollmentTeacherId) : true;
        const academicMatch = enrollmentAcademicCalendarId ? (e.academicCalendarId === enrollmentAcademicCalendarId || e.academicCalendar?.id === enrollmentAcademicCalendarId || e.term?.academicCalendarId === enrollmentAcademicCalendarId) : true;
        return classMatch && courseMatch && teacherMatch && academicMatch;
      });

      const filteredPayments = feePayments.payments.filter((p: any) => {
        const acadMatch = paymentAcademicCalendarId ? (p.academicCalendarId === paymentAcademicCalendarId || p.academicCalendar?.id === paymentAcademicCalendarId || p.term?.academicCalendarId === paymentAcademicCalendarId) : true;
        const studentMatch = paymentStudentId ? (p.studentId === paymentStudentId || p.student?.id === paymentStudentId) : true;
        const termMatch = paymentTermId ? (p.termId === paymentTermId || p.term?.id === paymentTermId) : true;
        const classMatch = paymentClassId ? (p.classId === paymentClassId || p.student?.classId === paymentClassId || p.student?.class?.id === paymentClassId) : true;
        return acadMatch && studentMatch && termMatch && classMatch;
      });

      const totalStudents = filteredStudents.length;
      const totalTeachers = filteredTeachers.length;
      const totalCourses = filteredCourses.length;
      const totalEnrollments = filteredEnrollments.length;
      const totalFeePayments = filteredPayments.length;
      const totalRevenue = filteredPayments.reduce(
        (sum, payment) => sum + (Number(payment.amount) || 0),
        0,
      );

      const studentsByGrade = await this.getStudentsByGrade(filteredStudents);
      const enrollmentsByMonth = await this.getEnrollmentsByMonth(filteredEnrollments);
      const paymentsByMonth = await this.getPaymentsByMonth(filteredPayments);
      const coursePopularity = await this.getCoursePopularity(filteredCourses, filteredEnrollments);
  const recentActivities = await this.getRecentActivities(targetSchoolId, superAdmin);

      return {
        totalStudents,
        totalTeachers,
        totalCourses,
        totalEnrollments,
        totalFeePayments,
        totalRevenue,
        studentsByGrade,
        enrollmentsByMonth,
        paymentsByMonth,
        coursePopularity,
        // Return filtered collections for table views if needed
        students: filteredStudents,
        teachers: filteredTeachers,
        courses: filteredCourses,
        enrollments: filteredEnrollments,
        feePayments: filteredPayments,
        recentActivities,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch report data: ' + error.message);
    }
  }

  @Get('students')
  @ApiOperation({ summary: 'Get students report with filters' })
  async getStudentsReport(
    @Request() req,
    @Query('gender') gender?: string,
    @Query('class') className?: string,
    @Query('classId') classId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    const where: any = {};
    if (gender) where.gender = gender;
    if (className) where.gradeLevel = className;
    const students = await this.studentsService.findAll(where, targetSchoolId, superAdmin);
    const filtered = students.filter((s: any) =>
      classId ? (s.classId === classId || s.class?.id === classId) : true,
    );
    return filtered;
  }

  @Get('teachers')
  @ApiOperation({ summary: 'Get teachers report with filters' })
  async getTeachersReport(
    @Request() req,
    @Query('gender') gender?: string,
    @Query('classId') classId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    const [teachers] = await this.teachersService.findAllPaginated(1, 5000, undefined, targetSchoolId, superAdmin);
    return teachers.filter((t: any) => {
      const g = gender ? t.gender === gender : true;
      const c = classId ? (t.classId === classId || t.assignedClass?.id === classId) : true;
      return g && c;
    });
  }

  @Get('courses')
  @ApiOperation({ summary: 'Get courses report with filters' })
  async getCoursesReport(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    const courses = await this.courseService.findAll({ schoolId: targetSchoolId, superAdmin });
    return courses.filter((c: any) => {
      const cls = classId ? (c.classId === classId || c.class?.id === classId) : true;
      const tea = teacherId ? (c.teacherId === teacherId || c.teacher?.id === teacherId) : true;
      return cls && tea;
    });
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'Get enrollments report with filters' })
  async getEnrollmentsReport(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('courseId') courseId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    const enrollments = await this.enrollmentService.findAll(targetSchoolId, superAdmin);
    return enrollments.filter((e: any) => {
      const cls = classId ? (e.classId === classId || e.class?.id === classId || e.course?.classId === classId || e.course?.class?.id === classId) : true;
      const crs = courseId ? (e.courseId === courseId || e.course?.id === courseId) : true;
      const tea = teacherId ? (e.teacherId === teacherId || e.course?.teacherId === teacherId || e.course?.teacher?.id === teacherId) : true;
      const acad = academicCalendarId ? (e.academicCalendarId === academicCalendarId || e.academicCalendar?.id === academicCalendarId || e.term?.academicCalendarId === academicCalendarId) : true;
      return cls && crs && tea && acad;
    });
  }

  @Get('fee-payments')
  @ApiOperation({ summary: 'Get fee payments report with filters' })
  async getFeePaymentsReport(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
    @Query('studentId') studentId?: string,
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    const paymentsPaged = await this.financeService.getAllPayments(1, 5000, '', targetSchoolId, superAdmin);
    const payments = paymentsPaged.payments;
    return payments.filter((p: any) => {
      const acad = academicCalendarId ? (p.academicCalendarId === academicCalendarId || p.academicCalendar?.id === academicCalendarId || p.term?.academicCalendarId === academicCalendarId) : true;
      const stu = studentId ? (p.studentId === studentId || p.student?.id === studentId) : true;
      const term = termId ? (p.termId === termId || p.term?.id === termId) : true;
      const cls = classId ? (p.classId === classId || p.student?.classId === classId || p.student?.class?.id === classId) : true;
      return acad && stu && term && cls;
    });
  }

  private async getStudentsByGrade(students: any[]): Promise<Array<{ grade: string; count: number }>> {
    const gradeMap = new Map<string, number>();
    students.forEach((student) => {
      const grade = student.gradeLevel || 'Unknown';
      gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);
    });

    return Array.from(gradeMap.entries()).map(([grade, count]) => ({
      grade,
      count,
    }));
  }

  private async getEnrollmentsByMonth(enrollments: any[]): Promise<Array<{ month: string; count: number }>> {
    const monthMap = new Map<string, number>();
    enrollments.forEach((enrollment) => {
      const date = new Date(enrollment.createdAt || enrollment.enrollmentDate);
      const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      monthMap.set(month, (monthMap.get(month) || 0) + 1);
    });

    return Array.from(monthMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));
  }

  private async getPaymentsByMonth(feePayments: FeePayment[]): Promise<Array<{ month: string; amount: number }>> {
    const monthMap = new Map<string, number>();
    feePayments.forEach((payment) => {
      const date = new Date(payment.paymentDate);
      const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      monthMap.set(month, (monthMap.get(month) || 0) + (Number(payment.amount) || 0));
    });

    return Array.from(monthMap.entries()).map(([month, amount]) => ({
      month,
      amount,
    }));
  }

  private async getCoursePopularity(
    courses: any[],
    enrollments: any[],
  ): Promise<Array<{ courseName: string; enrollments: number }>> {
    const courseMap = new Map<string, number>();
    courses.forEach((course) => {
      courseMap.set(course.id, 0);
    });

    enrollments.forEach((enrollment) => {
      const courseId = enrollment.courseId || enrollment.course?.id;
      if (courseMap.has(courseId)) {
        courseMap.set(courseId, (courseMap.get(courseId) || 0) + 1);
      }
    });

    return courses
      .map((course) => ({
        courseName: course.name,
        enrollments: courseMap.get(course.id) || 0,
      }))
      .sort((a, b) => b.enrollments - a.enrollments);
  }

  private async getRecentActivities(schoolId?: string, superAdmin = false): Promise<Array<{ id: string; type: string; description: string; date: string }>> {
    const [recentEnrollments, recentPayments] = await Promise.all([
      this.enrollmentService.findRecent(5, schoolId, superAdmin),
      this.financeService.getRecentPayments(5, schoolId, superAdmin),
    ]);

    const activities = [
      ...recentEnrollments.map((enrollment) => ({
        id: enrollment.id,
        type: 'Enrollment',
        description: `Student ${enrollment.student?.firstName || ''} ${enrollment.student?.lastName || ''} enrolled in ${enrollment.course?.name || 'Unknown Course'}`.trim(),
        date: (enrollment as any).createdAt || enrollment.enrollmentDate,
      })),
      ...recentPayments.map((payment) => ({
        id: payment.id,
        type: 'Payment',
        description: `Payment of $${payment.amount} received from ${(payment.student?.firstName || '') + ' ' + (payment.student?.lastName || '')}`.trim(),
        date: payment.paymentDate,
      })),
    ];

    return activities
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }
}