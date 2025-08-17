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
import { FeeAnalyticsService } from '../finance/services/fee-analytics.service';

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
    return { start: new Date(academicYearEntity.startDate), end: new Date(academicYearEntity.endDate), entity: academicYearEntity };
  }

  async getClassPerformance(classId: string, academicYearId?: string) {
    const range = await this.resolveAcademicYearRange(academicYearId);
    const qb = this.gradeRepo.createQueryBuilder('g')
      .leftJoin('g.class', 'c')
      .leftJoin('g.student', 's')
      .leftJoin('g.course', 'course')
      .where('c.id = :classId', { classId });
    if (range) qb.andWhere('g.date BETWEEN :start AND :end', { start: range.start, end: range.end });
    const grades = await qb.getMany();
    const cls = await this.classRepo.findOne({ where: { id: classId } });
    if (grades.length === 0) {
      return { class: cls ? { id: cls.id, name: cls.name } : { id: classId }, average: 0, studentStats: [], gradeDistribution: {}, topPerformers: [] };
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
    };
  }

  async getCourseAverages(academicYearId?: string, scope: 'current-year' | 'all' = 'current-year') {
    // If scope is all we ignore academic year filtering
    const range = scope === 'current-year' ? await this.resolveAcademicYearRange(academicYearId) : null;

    // Fetch grades with optional range
    const where: any = {};
    if (range) {
      where.date = { $between: [range.start, range.end] }; // will be translated manually
    }

    // Use QueryBuilder for flexible filtering
    const qb = this.gradeRepo.createQueryBuilder('g')
      .leftJoinAndSelect('g.course', 'course');
    if (range) {
      qb.where('g.date BETWEEN :start AND :end', { start: range.start, end: range.end });
    }
    const grades = await qb.getMany();

    // If no grades found under current-year scope, fallback to all time automatically
    if (grades.length === 0 && scope === 'current-year') {
      const allGrades = await this.gradeRepo.createQueryBuilder('g')
        .leftJoinAndSelect('g.course', 'course')
        .getMany();
      return this.aggregateCourseAverages(allGrades, true);
    }
    return this.aggregateCourseAverages(grades, false);
  }

  private aggregateCourseAverages(grades: Grade[], isFallback: boolean) {
    const courseMap = new Map<string, { name: string; total: number; count: number; numericSamples: number[] }>();
    for (const g of grades) {
      if (!g.course) continue;
      const cid = g.course.id;
      if (!courseMap.has(cid)) {
        courseMap.set(cid, { name: g.course.name, total: 0, count: 0, numericSamples: [] });
      }
      const entry = courseMap.get(cid)!;
      entry.count += 1;
      const val = parseFloat(g.grade);
      if (!isNaN(val)) {
        entry.total += val;
        entry.numericSamples.push(val);
      }
    }
    const result = Array.from(courseMap.entries()).map(([courseId, v]) => {
      const avg = v.numericSamples.length ? v.total / v.numericSamples.length : 0;
      // Distribution
      const dist = { A:0,B:0,C:0,D:0,F:0 } as Record<string, number>;
      v.numericSamples.forEach(n => {
        if (n >= 90) dist.A++; else if (n>=80) dist.B++; else if (n>=70) dist.C++; else if (n>=60) dist.D++; else dist.F++;
      });
      const best = Math.max(...v.numericSamples, 0);
      const worst = Math.min(...v.numericSamples, 0);
      return {
        courseId,
        courseName: v.name,
        average: parseFloat(avg.toFixed(2)),
        gradeCount: v.count,
        numericGradeCount: v.numericSamples.length,
        distribution: dist,
        highest: isFinite(best) ? best : 0,
        lowest: isFinite(worst) ? worst : 0,
        fallbackAllTime: isFallback,
      };
    }).sort((a,b)=> b.average - a.average);
    return result;
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

    const build = (applyRange: boolean) => {
      const qb = this.attendanceRepo.createQueryBuilder('a')
        .leftJoin('a.class', 'c')
        .select('c.id', 'classId')
        .addSelect('c.name', 'className')
        .addSelect('COUNT(a.id)', 'totalRecords')
        .addSelect("SUM(CASE WHEN a.isPresent THEN 1 ELSE 0 END)", 'presentCount')
        .groupBy('c.id')
        .addGroupBy('c.name');
      if (applyRange && range) {
        qb.where('a.date BETWEEN :start AND :end', { start: range.start, end: range.end });
      }
      return qb;
    };

    let rows = await build(true).getRawMany();
    let fallbackAllTime = false;
    if (rows.length === 0) {
      rows = await build(false).getRawMany();
      if (range) fallbackAllTime = true;
    }

    return rows.map(r => {
      const total = parseInt(r.totalRecords, 10) || 0;
      const present = parseInt(r.presentCount, 10) || 0;
      const absent = total - present;
      const rate = total ? parseFloat(((present / total) * 100).toFixed(2)) : 0;
      return {
        classId: r.classId,
        className: r.className,
        totalRecords: total,
        present,
        absent,
        attendanceRate: rate,
        fallbackAllTime,
      };
    });
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
