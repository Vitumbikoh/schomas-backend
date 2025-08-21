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
    @Query('studentAgeFrom') studentAgeFrom?: string,
    @Query('studentAgeTo') studentAgeTo?: string,
    @Query('studentClass') studentClass?: string,
    @Query('studentGender') studentGender?: string,
    @Query('teacherSubjectSpecialization') teacherSubjectSpecialization?: string,
    @Query('teacherAgeFrom') teacherAgeFrom?: string,
    @Query('teacherAgeTo') teacherAgeTo?: string,
    @Query('teacherStatus') teacherStatus?: string,
    @Query('teacherGender') teacherGender?: string,
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

      const totalStudents = students.length;
      const totalTeachers = teachers.length;
      const totalCourses = courses.length;
      const totalEnrollments = enrollments.length;
      const totalFeePayments = feePayments.payments.length; // Fix: Use feePayments.payments
      const totalRevenue = feePayments.payments.reduce(
        (sum, payment) => sum + (Number(payment.amount) || 0),
        0,
      ); // Fix: Use feePayments.payments

      const studentsByGrade = await this.getStudentsByGrade(students);
      const enrollmentsByMonth = await this.getEnrollmentsByMonth(enrollments);
      const paymentsByMonth = await this.getPaymentsByMonth(feePayments.payments); // Fix: Use feePayments.payments
      const coursePopularity = await this.getCoursePopularity(courses, enrollments);
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
        recentActivities,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch report data: ' + error.message);
    }
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