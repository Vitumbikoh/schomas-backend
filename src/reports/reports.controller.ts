import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
  InternalServerErrorException,
  Logger,
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
import { SettingsService } from '../settings/settings.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { ReportsMapperService } from './reports-mapper.service';
import { ComprehensiveReportDTO } from './dto/report-dtos';
import { LibraryService } from '../library/library.service';
import { StudentFeeExpectationService } from '../finance/student-fee-expectation.service';

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
    private readonly settingsService: SettingsService,
    private readonly reportsMapper: ReportsMapperService,
    private readonly libraryService: LibraryService,
    private readonly studentFeeExpectationService: StudentFeeExpectationService,
  ) {}

  private readonly logger = new Logger(ReportsController.name);

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
      this.logger.debug('GET /admin/reports params=' + JSON.stringify(req.query || {}));
      // Build where conditions for students
      const studentWhere: any = {};
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

      this.logger.debug(`Reports fetch start schoolId=${targetSchoolId} superAdmin=${superAdmin}`);
      
      // Fetch school information for report branding
      const schoolInfo = await this.safeFetch('schoolInfo', () => this.settingsService.getSchoolInfo(targetSchoolId));

      // StudentsService.findAll signature: findAll(options?: FindManyOptions<Student>, schoolId?: string, superAdmin = false)
      // Previous call passed plain where object (bug) causing incorrect query builder usage and potential runtime issues.
      const students = await this.safeFetch('students', () => this.studentsService.findAll({ where: studentWhere }, targetSchoolId, superAdmin));
      // Fetch remaining data sets in parallel for performance
      const [teachersRaw, coursesRaw, enrollmentsRaw, feePayments] = await Promise.all([
        this.safeFetch('teachers', () => this.teachersService.findAllPaginated(1, 5000, undefined, targetSchoolId, superAdmin).then(r => r[0])),
        this.safeFetch('courses', () => this.courseService.findAll({ schoolId: targetSchoolId, superAdmin })),
        this.safeFetch('enrollments', () => this.enrollmentService.findAll(targetSchoolId, superAdmin)),
        this.safeFetch('feePayments', () => this.financeService.getAllPayments(1, 1000, '', targetSchoolId, superAdmin)),
      ]);
      this.logger.debug('Reports fetch complete');

      // Map teachers to ensure user + assignedClass relations (teachersRaw already includes some relations via service)
      const teachers = teachersRaw;
      const courses = coursesRaw;
      const enrollments = enrollmentsRaw;

      // Apply controller-level filters for additional fields
      const filteredStudents = students.filter((s: any) => {
        const activeMatch = s.isActive !== false;
        const classIdMatch = studentClassId ? (s.classId === studentClassId || s.class?.id === studentClassId) : true;
        const genderMatch = studentGender ? s.gender === studentGender : true;
        const classNameMatch = studentClass ? (s.gradeLevel === studentClass || s.class?.name === studentClass) : true;
        return activeMatch && classIdMatch && genderMatch && classNameMatch;
      });

      const filteredTeachers = teachers.filter((t: any) => {
        const genderMatch = teacherGender ? t.gender === teacherGender : true;
        // Removed assignedClass relation usage (no such relation on Teacher entity currently)
        const classMatch = teacherClassId ? (t.classId === teacherClassId) : true;
        return genderMatch && classMatch;
      });

      const filteredCourses = courses.filter((c: any) => {
        const classMatch = courseClassId ? (c.classId === courseClassId || c.class?.id === courseClassId) : true;
        const teacherMatch = courseTeacherId ? (c.teacherId === courseTeacherId || c.teacher?.id === courseTeacherId) : true;
        return classMatch && teacherMatch;
      });

      const filteredEnrollments = enrollments.filter((e: any) => {
        // Enrollment entity has: course (with class), student (with class) but no direct class or teacherId columns defined now
        const classMatch = enrollmentClassId ? (
          e.course?.classId === enrollmentClassId ||
          e.course?.class?.id === enrollmentClassId ||
          e.student?.classId === enrollmentClassId ||
          e.student?.class?.id === enrollmentClassId
        ) : true;
        const courseMatch = enrollmentCourseId ? (e.courseId === enrollmentCourseId || e.course?.id === enrollmentCourseId) : true;
        const teacherMatch = enrollmentTeacherId ? (e.course?.teacherId === enrollmentTeacherId || e.course?.teacher?.id === enrollmentTeacherId) : true;
        const academicMatch = enrollmentAcademicCalendarId ? (e.term?.academicCalendarId === enrollmentAcademicCalendarId) : true;
        return classMatch && courseMatch && teacherMatch && academicMatch;
      });

      const filteredPayments = (feePayments?.payments || []).filter((p: any) => {
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

  // Defensive guards: ensure arrays before analytics to prevent runtime errors
  const safeArr = (val: any) => Array.isArray(val) ? val : [];
  const studentsByGrade = await this.getStudentsByGrade(safeArr(filteredStudents));
  const enrollmentsByMonth = await this.getEnrollmentsByMonth(safeArr(filteredEnrollments));
  const paymentsByMonth = await this.getPaymentsByMonth(safeArr(filteredPayments));
  const coursePopularity = await this.getCoursePopularity(safeArr(filteredCourses), safeArr(filteredEnrollments));
  const recentActivities = await this.getRecentActivities(targetSchoolId, superAdmin);

      const dto: ComprehensiveReportDTO = {
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
  students: safeArr(filteredStudents).map(s => this.reportsMapper.mapStudent(s)),
  teachers: safeArr(filteredTeachers).map(t => this.reportsMapper.mapTeacher(t)),
  courses: safeArr(filteredCourses).map(c => this.reportsMapper.mapCourse(c)),
  enrollments: safeArr(filteredEnrollments).map(e => this.reportsMapper.mapEnrollment(e)),
  feePayments: safeArr(filteredPayments).map(p => this.reportsMapper.mapPayment(p)),
        recentActivities,
        schoolInfo: schoolInfo || null, // Add school information for report branding
      };
      return dto;
    } catch (error) {
      this.logger.error('Report data generation failed', error?.stack || error);
      // Preserve original error message when possible while standardizing output
      throw new InternalServerErrorException('Failed to fetch report data: ' + (error?.message || 'Unknown error'));
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
    this.logger.debug(`GET /admin/reports/students schoolId=${targetSchoolId} gender=${gender} className=${className} classId=${classId}`);
    const where: any = {};
    if (gender) where.gender = gender;
    if (className) where.gradeLevel = className;
  const students = await this.studentsService.findAll({ where }, targetSchoolId, superAdmin);
    const filtered = students.filter((s: any) =>
      (s.isActive !== false) &&
      (classId ? (s.classId === classId || s.class?.id === classId) : true),
    );
  return filtered.map(s => this.reportsMapper.mapStudent(s));
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
    this.logger.debug(`GET /admin/reports/teachers schoolId=${targetSchoolId} gender=${gender} classId=${classId}`);
    const [teachers] = await this.teachersService.findAllPaginated(1, 5000, undefined, targetSchoolId, superAdmin);
    const filtered = teachers.filter((t: any) => {
      const g = gender ? t.gender === gender : true;
      const c = classId ? (t.classId === classId) : true; // removed assignedClass
      return g && c;
    });
    return filtered.map(t => this.reportsMapper.mapTeacher(t));
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
    this.logger.debug(`GET /admin/reports/courses schoolId=${targetSchoolId} classId=${classId} teacherId=${teacherId}`);
    const courses = await this.courseService.findAll({ schoolId: targetSchoolId, superAdmin });
    const filtered = courses.filter((c: any) => {
      const cls = classId ? (c.classId === classId || c.class?.id === classId) : true;
      const tea = teacherId ? (c.teacherId === teacherId || c.teacher?.id === teacherId) : true;
      return cls && tea;
    });
    return filtered.map(c => this.reportsMapper.mapCourse(c));
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
    this.logger.debug(`GET /admin/reports/enrollments schoolId=${targetSchoolId} classId=${classId} courseId=${courseId} teacherId=${teacherId} academicCalendarId=${academicCalendarId}`);
    const enrollments = await this.enrollmentService.findAll(targetSchoolId, superAdmin);
    const filtered = enrollments.filter((e: any) => {
      const cls = classId ? (
        e.course?.classId === classId || e.course?.class?.id === classId || e.student?.classId === classId || e.student?.class?.id === classId
      ) : true;
      const crs = courseId ? (e.courseId === courseId || e.course?.id === courseId) : true;
      const tea = teacherId ? (e.course?.teacherId === teacherId || e.course?.teacher?.id === teacherId) : true;
      const acad = academicCalendarId ? (e.term?.academicCalendarId === academicCalendarId) : true;
      return cls && crs && tea && acad;
    });
    return filtered.map(e => this.reportsMapper.mapEnrollment(e));
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
    this.logger.debug(`GET /admin/reports/fee-payments schoolId=${targetSchoolId} academicCalendarId=${academicCalendarId} studentId=${studentId} termId=${termId} classId=${classId}`);
    
    // Pass termId to getAllPayments so it can fetch payments for the selected term instead of always using current term
    const paymentsPaged = await this.financeService.getAllPayments(1, 5000, '', targetSchoolId, superAdmin, termId);
    const payments = paymentsPaged?.payments || [];
    
    // Additional filtering for academicCalendarId, studentId, and classId
    // Note: termId is already filtered at database level, so no need to filter again
    const filtered = payments.filter((p: any) => {
      // Filter by academic calendar if specified (term.academicCalendar relation is now loaded)
      const acad = academicCalendarId ? (p.term?.academicCalendarId === academicCalendarId || p.term?.academicCalendar?.id === academicCalendarId) : true;
      const stu = studentId ? (p.studentId === studentId || p.student?.id === studentId) : true;
      const cls = classId ? (p.classId === classId || p.student?.classId === classId || p.student?.class?.id === classId) : true;
      return acad && stu && cls;
    });
    return filtered.map(p => this.reportsMapper.mapPayment(p));
  }

  @Get('outstanding-balances')
  @ApiOperation({ summary: 'Get outstanding balances report for students with filters' })
  async getOutstandingBalancesReport(
    @Request() req,
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    
    this.logger.debug(`GET /admin/reports/outstanding-balances schoolId=${targetSchoolId} termId=${termId} classId=${classId} studentId=${studentId}`);
    
    // If no termId provided, use current term
    let effectiveTermId = termId;
    if (!effectiveTermId) {
      const currentTerm = await this.settingsService.getCurrentTerm(targetSchoolId);
      effectiveTermId = currentTerm?.id;
    }

    if (!effectiveTermId) {
      return [];
    }

    // Get outstanding balances for the term
    const balances = await this.studentFeeExpectationService.listStudentFeeStatuses(
      effectiveTermId,
      targetSchoolId,
      superAdmin,
    );

    // Apply filters
    const filtered = balances.filter((balance: any) => {
      const stu = studentId ? balance.studentId === studentId : true;
      // classId would require fetching student class info - implement if needed
      const cls = classId ? true : true; // TODO: add class filtering if student class is included
      return stu && cls;
    });

    return filtered;
  }

  @Get('library/most-borrowed')
  @ApiOperation({ summary: 'Get most borrowed books report with filters' })
  async getLibraryMostBorrowedReport(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('bookId') bookId?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    this.logger.debug(`GET /admin/reports/library/most-borrowed schoolId=${targetSchoolId} classId=${classId} bookId=${bookId} limit=${limit}`);
    
    const mostBorrowed = await this.libraryService.reportMostBorrowed(targetSchoolId);
    
    // Apply filters if provided
    let filtered = mostBorrowed;
    if (bookId) {
      filtered = filtered.filter(mb => mb.bookId === bookId);
    }
    
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum)) {
        filtered = filtered.slice(0, limitNum);
      }
    }
    
    return filtered;
  }

  @Get('library/overdue')
  @ApiOperation({ summary: 'Get overdue books report with filters' })
  async getLibraryOverdueReport(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('bookId') bookId?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    this.logger.debug(`GET /admin/reports/library/overdue schoolId=${targetSchoolId} classId=${classId} studentId=${studentId} bookId=${bookId}`);
    
    const overdue = await this.libraryService.reportOverdue(targetSchoolId);
    
    // Apply filters if provided
    let filtered = overdue;
    if (studentId) {
      filtered = filtered.filter(od => od.studentId === studentId);
    }
    if (bookId) {
      filtered = filtered.filter(od => od.bookId === bookId);
    }
    
    return filtered;
  }

  @Get('library/borrowings')
  @ApiOperation({ summary: 'Get library borrowings report with filters' })
  async getLibraryBorrowingsReport(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('bookId') bookId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const user = req.user;
    const superAdmin = user.role === Role.SUPER_ADMIN;
    const targetSchoolId = superAdmin ? (req.query.schoolId as string) : user.schoolId;
    this.logger.debug(`GET /admin/reports/library/borrowings schoolId=${targetSchoolId} classId=${classId} studentId=${studentId} bookId=${bookId} activeOnly=${activeOnly}`);
    
    const borrowings = await this.libraryService.listBorrowings(targetSchoolId, { 
      studentId, 
      activeOnly: activeOnly === 'true' 
    });
    
    // Apply additional filters
    let filtered = borrowings;
    if (bookId) {
      filtered = filtered.filter(b => b.bookId === bookId);
    }
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter(b => new Date(b.borrowedAt) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      filtered = filtered.filter(b => new Date(b.borrowedAt) <= toDate);
    }
    
    return filtered;
  }

  @Get('library/most-borrowed/export/excel')
  @ApiOperation({ summary: 'Export most borrowed books report as Excel' })
  async exportLibraryMostBorrowedExcel(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('bookId') bookId?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.getLibraryMostBorrowedReport(req, classId, bookId, limit);
    // In a real implementation, you would generate Excel file here
    // For now, return the data (you can implement Excel generation later)
    return { message: 'Excel export not yet implemented', data };
  }

  @Get('library/most-borrowed/export/pdf')
  @ApiOperation({ summary: 'Export most borrowed books report as PDF' })
  async exportLibraryMostBorrowedPDF(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('bookId') bookId?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.getLibraryMostBorrowedReport(req, classId, bookId, limit);
    // In a real implementation, you would generate PDF file here
    // For now, return the data (you can implement PDF generation later)
    return { message: 'PDF export not yet implemented', data };
  }

  @Get('library/overdue/export/excel')
  @ApiOperation({ summary: 'Export overdue books report as Excel' })
  async exportLibraryOverdueExcel(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('bookId') bookId?: string,
  ) {
    const data = await this.getLibraryOverdueReport(req, classId, studentId, bookId);
    return { message: 'Excel export not yet implemented', data };
  }

  @Get('library/overdue/export/pdf')
  @ApiOperation({ summary: 'Export overdue books report as PDF' })
  async exportLibraryOverduePDF(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('bookId') bookId?: string,
  ) {
    const data = await this.getLibraryOverdueReport(req, classId, studentId, bookId);
    return { message: 'PDF export not yet implemented', data };
  }

  @Get('library/borrowings/export/excel')
  @ApiOperation({ summary: 'Export library borrowings report as Excel' })
  async exportLibraryBorrowingsExcel(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('bookId') bookId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const data = await this.getLibraryBorrowingsReport(req, classId, studentId, bookId, activeOnly, dateFrom, dateTo);
    return { message: 'Excel export not yet implemented', data };
  }

  @Get('library/borrowings/export/pdf')
  @ApiOperation({ summary: 'Export library borrowings report as PDF' })
  async exportLibraryBorrowingsPDF(
    @Request() req,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('bookId') bookId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const data = await this.getLibraryBorrowingsReport(req, classId, studentId, bookId, activeOnly, dateFrom, dateTo);
    return { message: 'PDF export not yet implemented', data };
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
      const raw = enrollment?.createdAt || enrollment?.enrollmentDate;
      if (!raw) return; // skip if no date
      const date = new Date(raw);
      if (isNaN(date.getTime())) return; // skip invalid date
      const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      monthMap.set(month, (monthMap.get(month) || 0) + 1);
    });

    return Array.from(monthMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));
  }

  private async getPaymentsByMonth(feePayments: FeePayment[]): Promise<Array<{ month: string, amount: number }>> {
    const monthMap = new Map<string, number>();
    feePayments.forEach((payment) => {
      if (!payment) return;
      const raw = (payment as any).paymentDate || (payment as any).createdAt;
      if (!raw) return;
      const date = new Date(raw);
      if (isNaN(date.getTime())) return;
      const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      monthMap.set(month, (monthMap.get(month) || 0) + (Number((payment as any).amount) || 0));
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

    this.logger.debug(`Recent activities raw counts enrollments=${recentEnrollments?.length || 0} payments=${recentPayments?.length || 0}`);

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

  private buildDateOfBirthWhere(ageFrom?: string, ageTo?: string) {
    if (!ageFrom && !ageTo) return undefined;
    const today = new Date();
    const fromNum = ageFrom ? parseInt(ageFrom, 10) : undefined;
    const toNum = ageTo ? parseInt(ageTo, 10) : undefined;
    const startDOB = toNum != null ? new Date(today.getFullYear() - toNum, today.getMonth(), today.getDate()) : undefined;
    const endDOB = fromNum != null ? new Date(today.getFullYear() - fromNum, today.getMonth(), today.getDate()) : undefined;
    if (startDOB && endDOB) return { $between: [startDOB, endDOB] } as any;
    if (startDOB) return { $gte: startDOB } as any;
    if (endDOB) return { $lte: endDOB } as any;
    return undefined;
  }
  private filterByDOBRange(entity: any, dobRange: any): boolean {
    if (!dobRange) return true;
    const dob = entity.dateOfBirth ? new Date(entity.dateOfBirth) : null;
    if (!dob) return false;
    if (dobRange.$between) return dob >= dobRange.$between[0] && dob <= dobRange.$between[1];
    if (dobRange.$gte) return dob <= dobRange.$gte; // older (greater age)
    if (dobRange.$lte) return dob >= dobRange.$lte; // younger (lesser age)
    return true;
  }

  /**
   * Wrap individual service calls so a single failure is logged clearly before the global catch.
   */
  private async safeFetch<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.logger.debug(`Fetched ${label}`);
      return result;
    } catch (err: any) {
      this.logger.error(`Failed fetching ${label}: ${err?.message}`);
      throw err;
    }
  }
}
