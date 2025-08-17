import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grade } from '../grades/entity/grade.entity';
import { Class } from '../classes/entity/class.entity';
import { Course } from '../course/entities/course.entity';
import { Attendance } from '../attendance/entity/attendance.entity';
import { FeePayment } from '../finance/entities/fee-payment.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { AcademicYear } from '../settings/entities/academic-year.entity';
import { SettingsService } from '../settings/settings.service';
import { FeeAnalyticsService } from '../finance/fee-analytics.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Grade) private gradeRepo: Repository<Grade>,
    @InjectRepository(Class) private classRepo: Repository<Class>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Attendance) private attendanceRepo: Repository<Attendance>,
    @InjectRepository(FeePayment) private feePaymentRepo: Repository<FeePayment>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(AcademicYear) private academicYearRepo: Repository<AcademicYear>,
    private settingsService: SettingsService,
    private feeAnalyticsService: FeeAnalyticsService,
  ) {}

  private async resolveAcademicYearRange(academicYearId?: string): Promise<{ start: Date; end: Date; entity: AcademicYear } | null> {
    let academicYearEntity: AcademicYear | null = null;
    if (academicYearId) {
      academicYearEntity = await this.academicYearRepo.findOne({ where: { id: academicYearId } });
    } else {
      const current = await this.settingsService.getCurrentAcademicYear();
      if (current?.id) {
        academicYearEntity = await this.academicYearRepo.findOne({ where: { id: current.id } });
      }
    }
    if (!academicYearEntity) return null;
    const start = new Date(academicYearEntity.startDate);
    const end = new Date(academicYearEntity.endDate);
    // Normalize range: ensure end covers entire day (23:59:59.999) to avoid excluding same-day timestamps
    end.setHours(23,59,59,999);
    return { start, end, entity: academicYearEntity };
  }

  async getClassPerformance(classId: string, academicYearId?: string) {
    const range = await this.resolveAcademicYearRange(academicYearId);
    const qbBase = this.gradeRepo.createQueryBuilder('g')
      .leftJoin('g.class', 'c')
      .leftJoin('g.student', 's')
      .leftJoin('g.course', 'course')
      .where('c.id = :classId', { classId });
    if (range) qbBase.andWhere('g.date BETWEEN :start AND :end', { start: range.start, end: range.end });
  let grades = await qbBase.getMany();
  let filteredBy: { academicYearApplied: boolean; viaStudentClassFallback?: boolean } = { academicYearApplied: !!range };
    // Fallback 1: If no grades found WITH date filter, try without date filter (maybe range mismatch)
    if (grades.length === 0 && range) {
      const qbNoDate = this.gradeRepo.createQueryBuilder('g')
        .leftJoin('g.class', 'c')
        .leftJoin('g.student', 's')
        .leftJoin('g.course', 'course')
        .where('c.id = :classId', { classId });
      const gradesNoDate = await qbNoDate.getMany();
      if (gradesNoDate.length > 0) {
        grades = gradesNoDate;
        filteredBy.academicYearApplied = false; // date filter caused exclusion
      }
    }
    // Fallback 2: If still none, attempt match via students' class (older grades might have null classId)
    if (grades.length === 0) {
      const studentIds = await this.studentRepo.createQueryBuilder('st')
        .select('st.id', 'id')
        .where('st.classId = :classId', { classId })
        .getRawMany();
      if (studentIds.length > 0) {
        const ids = studentIds.map(r => r.id);
        const qbStudent = this.gradeRepo.createQueryBuilder('g')
          .leftJoin('g.student', 's')
          .leftJoin('g.course', 'course')
          .where('s.id IN (:...ids)', { ids });
        const maybeRange = range ? qbStudent.andWhere('g.date BETWEEN :start AND :end', { start: range.start, end: range.end }) : qbStudent;
        let studentGrades = await maybeRange.getMany();
        if (studentGrades.length === 0 && range) {
          // Retry without date
            studentGrades = await this.gradeRepo.createQueryBuilder('g')
              .leftJoin('g.student', 's')
              .leftJoin('g.course', 'course')
              .where('s.id IN (:...ids)', { ids })
              .getMany();
            if (studentGrades.length > 0) filteredBy.academicYearApplied = false;
        }
        if (studentGrades.length > 0) {
          grades = studentGrades;
          filteredBy = { ...filteredBy, viaStudentClassFallback: true };
        }
      }
    }
    const cls = await this.classRepo.findOne({ where: { id: classId } });
    if (grades.length === 0) {
      return { class: cls ? { id: cls.id, name: cls.name } : { id: classId }, average: 0, studentStats: [], gradeDistribution: {}, topPerformers: [], meta: { reason: 'NO_GRADES_FOUND', filteredBy } };
    }
    const distribution: Record<string, number> = { A:0,B:0,C:0,D:0,F:0 };
    interface StudentAgg { total: number; count: number; firstName?: string; lastName?: string; }
    const studentMap = new Map<string, StudentAgg>();
    let total = 0; let count = 0;
    for (const g of grades) {
      const num = parseFloat(g.grade) || 0; total += num; count += 1;
      let letter: keyof typeof distribution = 'F';
      if (num >= 90) letter = 'A'; else if (num >=80) letter='B'; else if (num>=70) letter='C'; else if (num>=60) letter='D';
      distribution[letter]++;
      const sid = (g as any).student?.studentId || (g as any).student?.id;
      if (!studentMap.has(sid)) studentMap.set(sid, { total:0, count:0, firstName: (g as any).student?.firstName, lastName: (g as any).student?.lastName });
      const agg = studentMap.get(sid)!; agg.total += num; agg.count += 1;
    }
    const studentStats = Array.from(studentMap.entries()).map(([studentId, v]) => ({
      studentId,
      firstName: v.firstName,
      lastName: v.lastName,
      average: parseFloat((v.total / v.count).toFixed(2)),
    })).sort((a,b)=> b.average - a.average);
    return {
      class: cls ? { id: cls.id, name: cls.name } : { id: classId },
      average: parseFloat((total/(count||1)).toFixed(2)),
      studentStats,
      gradeDistribution: distribution,
      topPerformers: studentStats.slice(0,5),
  meta: { filteredBy }
    };
  }

  async getCourseAverages(academicYearId?: string) {
    const range = await this.resolveAcademicYearRange(academicYearId);
    const qb = this.gradeRepo.createQueryBuilder('g')
      .leftJoin('g.course', 'course')
      .select('course.id', 'courseId')
      .addSelect('course.name', 'courseName')
      .addSelect('AVG(CAST(g.grade as float))', 'average')
      .groupBy('course.id')
      .addGroupBy('course.name');
    if (range) qb.where('g.date BETWEEN :start AND :end', { start: range.start, end: range.end });
    const raw = await qb.getRawMany();
    return raw.map(r => ({ courseId: r.courseId, courseName: r.courseName, average: parseFloat(parseFloat(r.average||'0').toFixed(2)) }));
  }

  async getAttendanceOverview(academicYearId?: string) {
    const range = await this.resolveAcademicYearRange(academicYearId);
    const qb = this.attendanceRepo.createQueryBuilder('a')
      .select("TO_CHAR(a.date, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'totalRecords')
      .addSelect("SUM(CASE WHEN a.isPresent THEN 1 ELSE 0 END)", 'presentCount')
      .groupBy('month')
      .orderBy('month', 'ASC');
    if (range) qb.where('a.date BETWEEN :start AND :end', { start: range.start, end: range.end });
    const rows = await qb.getRawMany();
    return rows.map(r => ({ month: r.month, totalRecords: parseInt(r.totalRecords,10), present: parseInt(r.presentCount,10), attendanceRate: parseFloat(((parseInt(r.presentCount,10)/(parseInt(r.totalRecords,10)||1))*100).toFixed(2)) }));
  }

  async getAttendanceByClass(academicYearId?: string) {
    const range = await this.resolveAcademicYearRange(academicYearId);
    const qb = this.attendanceRepo.createQueryBuilder('a')
      .leftJoin('a.class', 'c')
      .select('c.id', 'classId')
      .addSelect('c.name', 'className')
      .addSelect('COUNT(*)', 'totalRecords')
      .addSelect("SUM(CASE WHEN a.isPresent THEN 1 ELSE 0 END)", 'presentCount')
      .groupBy('c.id')
      .addGroupBy('c.name');
    if (range) qb.where('a.date BETWEEN :start AND :end', { start: range.start, end: range.end });
    const rows = await qb.getRawMany();
    return rows.map(r => ({ classId: r.classId, className: r.className, totalRecords: parseInt(r.totalRecords,10), present: parseInt(r.presentCount,10), attendanceRate: parseFloat(((parseInt(r.presentCount,10)/(parseInt(r.totalRecords,10)||1))*100).toFixed(2)) }));
  }

  async getFeeCollectionStatus(academicYearId?: string) {
  // The underlying service expects a string | undefined but its signature is string (wrap safely)
  return this.feeAnalyticsService.getFeeAnalytics(academicYearId || undefined as any);
  }

  async getCurrentAcademicYearDetails() {
    const current = await this.settingsService.getCurrentAcademicYear();
    if (!current) return null;
    const entity = await this.academicYearRepo.findOne({ where: { id: current.id } });
    if (!entity) return null;
    return {
      id: entity.id,
      startDate: entity.startDate,
      endDate: entity.endDate,
      term: entity.term?.name,
      academicYear: entity.academicCalendar?.academicYear,
      isCurrent: entity.isCurrent,
    };
  }

  async getDashboardSummary() {
    const [students, teachers] = await Promise.all([
      this.studentRepo.count(),
      this.teacherRepo.count(),
    ]);
    const currentYear = await this.getCurrentAcademicYearDetails();
    let gradeAvg = 0;
    if (currentYear) {
      const raw = await this.gradeRepo.createQueryBuilder('g')
        .select('AVG(CAST(g.grade as float))', 'avg')
        .where('g.date BETWEEN :s AND :e', { s: currentYear.startDate, e: currentYear.endDate })
        .getRawOne();
      gradeAvg = parseFloat(parseFloat(raw?.avg || '0').toFixed(2));
    }
    let attendanceRate = 0;
    if (currentYear) {
      const raw = await this.attendanceRepo.createQueryBuilder('a')
        .select("SUM(CASE WHEN a.isPresent THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*),0) * 100", 'rate')
        .where('a.date BETWEEN :s AND :e', { s: currentYear.startDate, e: currentYear.endDate })
        .getRawOne();
      attendanceRate = parseFloat(parseFloat(raw?.rate || '0').toFixed(2));
    }
    let feePaymentPercentage = 0;
    try {
      const feeStatus: any = await this.getFeeCollectionStatus(currentYear?.id);
      // Support either paymentSummary or summary shape
      if (feeStatus?.paymentSummary?.paymentPercentage !== undefined) {
        feePaymentPercentage = feeStatus.paymentSummary.paymentPercentage;
      } else if (feeStatus?.summary?.paymentPercentage !== undefined) {
        feePaymentPercentage = feeStatus.summary.paymentPercentage;
      }
    } catch { /* ignore */ }
    return {
      totalStudents: students,
      totalTeachers: teachers,
      currentAcademicYear: currentYear,
      averageGrade: gradeAvg,
      attendanceRate,
      feePaymentPercentage,
    };
  }
}
