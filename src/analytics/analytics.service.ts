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
import { Term } from '../settings/entities/term.entity';
import { Exam } from '../exams/entities/exam.entity';
import { ExamGradeRecord } from '../aggregation/entities/exam-grade-record.entity';
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
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(Exam) private examRepo: Repository<Exam>,
    @InjectRepository(ExamGradeRecord) private examGradeRepo: Repository<ExamGradeRecord>,
    private settingsService: SettingsService,
    private feeAnalyticsService: FeeAnalyticsService,
  ) {}

  private async resolveTermRange(termId?: string): Promise<{ start: Date; end: Date; entity: Term } | null> {
    let termEntity: Term | null = null;
    if (termId) {
      termEntity = await this.termRepo.findOne({ where: { id: termId } });
    } else {
      const current = await this.settingsService.getCurrentTerm();
      if (current?.id) {
        termEntity = await this.termRepo.findOne({ where: { id: current.id } });
      }
    }
    if (!termEntity) return null;
    return { start: new Date(termEntity.startDate), end: new Date(termEntity.endDate), entity: termEntity };
  }

  async getClassPerformance(classId: string, TermId?: string, schoolId?: string, superAdmin = false) {
    const range = await this.resolveTermRange(TermId);
    const qb = this.gradeRepo.createQueryBuilder('g')
      .leftJoin('g.class', 'c')
      .leftJoin('g.student', 's')
      .leftJoin('g.course', 'course')
      .where('c.id = :classId', { classId });
      
    // Apply school filtering
    if (!superAdmin) {
      if (!schoolId) return { class: { id: classId }, average: 0, studentStats: [], gradeDistribution: {}, topPerformers: [] };
      qb.andWhere('s.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.andWhere('s.schoolId = :schoolId', { schoolId });
    }
      
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

  async getCourseAverages(TermId?: string, scope: 'current-year' | 'all' = 'current-year', schoolId?: string, superAdmin = false) {
    // If scope is all we ignore term filtering
    const range = scope === 'current-year' ? await this.resolveTermRange(TermId) : null;

    // Use QueryBuilder for flexible filtering
    const qb = this.gradeRepo.createQueryBuilder('g')
      .leftJoinAndSelect('g.course', 'course')
      .leftJoin('g.student', 's');
      
    // Apply school filtering
    if (!superAdmin) {
      if (!schoolId) return [];
      qb.where('s.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.where('s.schoolId = :schoolId', { schoolId });
    }
      
    if (range) {
      qb.andWhere('g.date BETWEEN :start AND :end', { start: range.start, end: range.end });
    }
    const grades = await qb.getMany();

    // If no grades found under current-year scope, fallback to all time automatically
    if (grades.length === 0 && scope === 'current-year') {
      const allGradesQb = this.gradeRepo.createQueryBuilder('g')
        .leftJoinAndSelect('g.course', 'course')
        .leftJoin('g.student', 's');
        
      // Apply school filtering to fallback query as well
      if (!superAdmin) {
        if (!schoolId) return [];
        allGradesQb.where('s.schoolId = :schoolId', { schoolId });
      } else if (schoolId) {
        allGradesQb.where('s.schoolId = :schoolId', { schoolId });
      }
      
      const allGrades = await allGradesQb.getMany();
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

  async getAttendanceOverview(TermId?: string, schoolId?: string, superAdmin = false) {
    const range = await this.resolveTermRange(TermId);
    const qb = this.attendanceRepo.createQueryBuilder('a')
      .leftJoin('a.student', 's')
      .select("TO_CHAR(a.date, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'totalRecords')
      .addSelect("SUM(CASE WHEN a.isPresent THEN 1 ELSE 0 END)", 'presentCount')
      .groupBy('month')
      .orderBy('month', 'ASC');
      
    // Apply school filtering
    if (!superAdmin) {
      if (!schoolId) return [];
      qb.where('s.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.where('s.schoolId = :schoolId', { schoolId });
    }
      
    if (range) {
      qb.andWhere('a.date BETWEEN :start AND :end', { start: range.start, end: range.end });
    }
    const rows = await qb.getRawMany();
    return rows.map(r => ({ month: r.month, totalRecords: parseInt(r.totalRecords,10), present: parseInt(r.presentCount,10), attendanceRate: parseFloat(((parseInt(r.presentCount,10)/(parseInt(r.totalRecords,10)||1))*100).toFixed(2)) }));
  }

  async getAttendanceByClass(TermId?: string, schoolId?: string, superAdmin = false) {
    const range = await this.resolveTermRange(TermId);

    const build = (applyRange: boolean) => {
      const qb = this.attendanceRepo.createQueryBuilder('a')
        .leftJoin('a.class', 'c')
        .leftJoin('a.student', 's')
        .select('c.id', 'classId')
        .addSelect('c.name', 'className')
        .addSelect('COUNT(a.id)', 'totalRecords')
        .addSelect("SUM(CASE WHEN a.isPresent THEN 1 ELSE 0 END)", 'presentCount')
        .groupBy('c.id')
        .addGroupBy('c.name');
        
      // Apply school filtering
      if (!superAdmin) {
        if (!schoolId) return qb.where('1=0'); // No results if no schoolId for non-super admin
        qb.where('s.schoolId = :schoolId', { schoolId });
      } else if (schoolId) {
        qb.where('s.schoolId = :schoolId', { schoolId });
      }
        
      if (applyRange && range) {
        qb.andWhere('a.date BETWEEN :start AND :end', { start: range.start, end: range.end });
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

  async getFeeCollectionStatus(TermId?: string, schoolId?: string, superAdmin = false) {
    // Use the fee analytics service with proper school filtering
    return this.feeAnalyticsService.getFeeAnalytics(TermId || undefined, schoolId, superAdmin);
  }

  async getCurrentTermDetails() {
    const current = await this.settingsService.getCurrentTerm();
    if (!current) return null;
    const entity = await this.termRepo.findOne({ where: { id: current.id } });
    if (!entity) return null;
    return {
      id: entity.id,
      startDate: entity.startDate,
      endDate: entity.endDate,
      period: entity.period?.name,
      Term: entity.academicCalendar?.term,
      isCurrent: entity.isCurrent,
    };
  }

  async getDashboardSummary(schoolId?: string, superAdmin = false) {
    // Apply school filtering for students and teachers count
    const studentWhere: any = {};
    const teacherWhere: any = {};
    
    if (!superAdmin) {
      if (!schoolId) {
        return {
          totalStudents: 0,
          totalTeachers: 0,
          currentTerm: null,
          averageGrade: 0,
          attendanceRate: 0,
          feePaymentPercentage: 0,
        };
      }
      studentWhere.schoolId = schoolId;
      teacherWhere.schoolId = schoolId;
    } else if (schoolId) {
      studentWhere.schoolId = schoolId;
      teacherWhere.schoolId = schoolId;
    }
    
    const [students, teachers] = await Promise.all([
      this.studentRepo.count({ where: studentWhere }),
      this.teacherRepo.count({ where: teacherWhere }),
    ]);
    
    const currentYear = await this.getCurrentTermDetails();
    let gradeAvg = 0;
    if (currentYear) {
      const qb = this.gradeRepo.createQueryBuilder('g')
        .leftJoin('g.student', 's')
        .select('AVG(CAST(g.grade as float))', 'avg')
        .where('g.date BETWEEN :s AND :e', { s: currentYear.startDate, e: currentYear.endDate });
      
      // Apply school filtering to grades
      if (!superAdmin) {
        if (schoolId) qb.andWhere('s.schoolId = :schoolId', { schoolId });
      } else if (schoolId) {
        qb.andWhere('s.schoolId = :schoolId', { schoolId });
      }
      
      const raw = await qb.getRawOne();
      gradeAvg = parseFloat(parseFloat(raw?.avg || '0').toFixed(2));
    }
    
    let attendanceRate = 0;
    if (currentYear) {
      const qb = this.attendanceRepo.createQueryBuilder('a')
        .leftJoin('a.student', 's')
        .select("SUM(CASE WHEN a.isPresent THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*),0) * 100", 'rate')
        .where('a.date BETWEEN :s AND :e', { s: currentYear.startDate, e: currentYear.endDate });
      
      // Apply school filtering to attendance
      if (!superAdmin) {
        if (schoolId) qb.andWhere('s.schoolId = :schoolId', { schoolId });
      } else if (schoolId) {
        qb.andWhere('s.schoolId = :schoolId', { schoolId });
      }
      
      const raw = await qb.getRawOne();
      attendanceRate = parseFloat(parseFloat(raw?.rate || '0').toFixed(2));
    }
    
    let feePaymentPercentage = 0;
    try {
      const feeStatus: any = await this.getFeeCollectionStatus(currentYear?.id, schoolId, superAdmin);
      // Support either paymentSummary or summary shape
      if (feeStatus?.paymentSummary?.paymentPercentage !== undefined) {
        feePaymentPercentage = feeStatus.paymentSummary.paymentPercentage;
      } else if (feeStatus?.summary?.paymentPercentage !== undefined) {
        feePaymentPercentage = feeStatus.summary.paymentPercentage;
      }
    } catch (error) { 
      console.log('Error fetching fee collection status:', error);
    }
    
    return {
      totalStudents: students,
      totalTeachers: teachers,
      currentTerm: currentYear,
      averageGrade: gradeAvg,
      attendanceRate,
      feePaymentPercentage,
    };
  }

  /**
   * Compute performance metrics per teacher based on student grades.
   * Metrics:
   *  - avgGrade: Average numeric grade across all their submitted grades
   *  - passRate: % of grades >= passThreshold (default 50)
   *  - studentCount: Distinct students taught (from grades submitted)
   *  - gradeCount: Total grade records
   * Optional filtering by term (current term if not provided) and school (multi-tenant scope).
   */
  async getTeacherPerformance(options: { termId?: string; schoolId?: string; superAdmin?: boolean; passThreshold?: number; limit?: number } = {}) {
    const { termId, schoolId, superAdmin = false, passThreshold = 50, limit } = options;

    // Resolve term (current if none supplied)
    let effectiveTermId = termId;
    if (!effectiveTermId) {
      const current = await this.getCurrentTermDetails();
      effectiveTermId = current?.id;
    }

    // Base query – join teacher via exam.teacher relation
    const qb = this.examGradeRepo.createQueryBuilder('egr')
      .leftJoin('egr.exam', 'exam')
      .leftJoin('exam.teacher', 't')
      .leftJoin('egr.student', 's')
      .select('t.id', 'teacherId')
      .addSelect('t.firstName', 'firstName')
      .addSelect('t.lastName', 'lastName')
      .addSelect('COUNT(egr.id)', 'gradeCount')
      .addSelect('COUNT(DISTINCT s.id)', 'studentCount')
      .addSelect('AVG(CAST(egr.percentage as float))', 'avgGrade')
      .addSelect(`SUM(CASE WHEN CAST(egr.percentage as float) >= :passThreshold THEN 1 ELSE 0 END)`, 'passCount')
      .groupBy('t.id');

    // School scoping via examGradeRecord.schoolId
    if (!superAdmin) {
      if (!schoolId) {
        // For debugging: temporarily allow query without schoolId filtering
        console.log('No schoolId provided for non-super-admin user, allowing query without school filter');
      } else {
        qb.where('egr.schoolId = :schoolId', { schoolId });
      }
    } else if (schoolId) {
      qb.where('egr.schoolId = :schoolId', { schoolId });
    }

    if (effectiveTermId) {
      qb.andWhere('egr.termId = :termId', { termId: effectiveTermId });
    }

    qb.setParameter('passThreshold', passThreshold);

    console.log('Teacher performance query:', qb.getQuery());
    console.log('Teacher performance params:', qb.getParameters());

    const raw = await qb.getRawMany();
    console.log('Raw teacher performance results:', raw);
    const teachers = raw.map(r => {
      const avg = parseFloat(parseFloat(r.avgGrade || '0').toFixed(2));
      const gradeCount = parseInt(r.gradeCount, 10) || 0;
      const passCount = parseInt(r.passCount, 10) || 0;
      const passRate = gradeCount ? parseFloat(((passCount / gradeCount) * 100).toFixed(2)) : 0;
      return {
        teacherId: r.teacherId,
        firstName: r.firstName,
        lastName: r.lastName,
        gradeCount,
        studentCount: parseInt(r.studentCount, 10) || 0,
        avgGrade: avg,
        passRate,
      };
    }).filter(t => t.teacherId); // filter out null teacher rows (if any grade rows lack teacher)

    console.log('Processed teachers:', teachers);

    // Sort by avgGrade desc then passRate desc
    teachers.sort((a,b)=> (b.avgGrade - a.avgGrade) || (b.passRate - a.passRate));

    const limited = typeof limit === 'number' ? teachers.slice(0, limit) : teachers;
    const topPerformer = limited[0] || null;

    return {
      metadata: {
        termId: effectiveTermId || null,
        total: teachers.length,
        generatedAt: new Date().toISOString(),
        passThreshold,
      },
      topPerformer,
      teachers: limited,
    };
  }
}
