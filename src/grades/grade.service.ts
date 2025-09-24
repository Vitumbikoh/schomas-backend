import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateGradeDto } from './dtos/grade.dto';
import { User } from '../user/entities/user.entity';
import { Course } from '../course/entities/course.entity';
import { Class } from '../classes/entity/class.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Role } from '../user/enums/role.enum';
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Grade } from './entity/grade.entity';
import { Term } from 'src/settings/entities/term.entity';
import { AcademicCalendar } from 'src/settings/entities/academic-calendar.entity';
import { GradesReportQueryDto } from './dtos/grades-report-query.dto';
import { GradeFormat } from './entity/grade-format.entity';
import { IsNull } from 'typeorm';
import { AggregationService } from '../aggregation/aggregation.service';
import { Exam } from '../exams/entities/exam.entity';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { ExamGradeRecord } from '../aggregation/aggregation.entity';

@Injectable()
export class GradeService {
  constructor(
    @InjectRepository(Grade)
    private gradeRepository: Repository<Grade>,
  @InjectRepository(GradeFormat)
  private gradeFormatRepository: Repository<GradeFormat>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Term)
    private termRepository: Repository<Term>,
    @InjectRepository(AcademicCalendar)
    private academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(Exam)
    private examRepository: Repository<Exam>,
    @InjectRepository(ExamResultAggregate)
    private examResultRepository: Repository<ExamResultAggregate>,
    @InjectRepository(ExamGradeRecord)
    private examGradeRecordRepository: Repository<ExamGradeRecord>,
    private aggregationService: AggregationService,
  ) {}

  async createGrades(
    createGradeDto: CreateGradeDto,
    userId: string,
  ): Promise<any> {
    // Validate input structure
    if (!createGradeDto || typeof createGradeDto !== 'object') {
      throw new BadRequestException('Invalid request payload');
    }

    const { classId, courseId, assessmentType, grades } = createGradeDto;

    // Validate grades object exists and has content
    if (
      !grades ||
      typeof grades !== 'object' ||
      Object.keys(grades).length === 0
    ) {
      throw new BadRequestException('No valid grades provided');
    }

    // Fetch user with TEACHER role
    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.TEACHER },
    });
    if (!user) {
      throw new UnauthorizedException(
        'User is not a teacher or does not exist',
      );
    }

    // Fetch teacher by userId
    const teacher = await this.teacherRepository.findOne({
      where: { userId: userId },
    });
    if (!teacher) {
      throw new UnauthorizedException(
        'No Teacher profile associated with this user',
      );
    }

    // Fetch class
    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
    });
    if (!classEntity) {
      throw new BadRequestException('Invalid class');
    }

    // Fetch course and verify teacher association
    const course = await this.courseRepository.findOne({
      where: { id: courseId, teacher: { id: teacher.id } },
      relations: ['teacher', 'enrollments', 'enrollments.student'],
    });
    if (!course) {
      throw new BadRequestException('Invalid course or teacher not assigned');
    }

    // Get all enrolled student IDs for this course
    const enrolledStudentIds =
      course.enrollments?.map((e) => e.student.studentId) || [];

    // Get current term
    const currentTerm = await this.termRepository.findOne({
      where: { isCurrent: true },
    });
    if (!currentTerm) {
      throw new BadRequestException('No current term found');
    }

    // Validate assessment type
    const validAssessmentTypes = [
      'midterm',
      'endterm',
      'quiz',
      'assignment',
      'practical',
    ];
    if (!validAssessmentTypes.includes(assessmentType)) {
      throw new BadRequestException('Invalid assessment type');
    }

    // Find existing exam for this course/assessment type combination
    let exam = await this.examRepository.findOne({
      where: {
        course: { id: courseId },
        examType: assessmentType,
        TermId: currentTerm.id,
        teacher: { id: teacher.id },
      },
    });

    // If no exam exists, create a placeholder exam
    if (!exam) {
      exam = this.examRepository.create({
        title: `${assessmentType} - ${course.name}`,
        examType: assessmentType,
        course: course,
        teacher: teacher,
        class: classEntity,
        TermId: currentTerm.id,
        totalMarks: 100, // Default total marks
        status: 'graded' as const,
        schoolId: teacher.schoolId,
        date: new Date().toISOString().split('T')[0], // Format as YYYY-MM-DD
        duration: '60 minutes', // Default duration
        studentsEnrolled: enrolledStudentIds.length,
      });
      exam = await this.examRepository.save(exam);
    }

    // Process grades via aggregation service
    const results: any[] = [];
    for (const [studentId, gradeValue] of Object.entries(grades)) {
      // Check if student is enrolled in course
      if (!enrolledStudentIds.includes(studentId)) {
        throw new BadRequestException(
          `Student ${studentId} is not enrolled in this course`,
        );
      }

      // Validate student exists
      const student = await this.studentRepository.findOne({
        where: { studentId },
      });
      if (!student) {
        throw new BadRequestException(`Invalid student ID: ${studentId}`);
      }

      // Record grade via aggregation service (must pass teacher.userId for compatibility)
      try {
        const result = await this.aggregationService.recordExamGrade(
          {
            examId: exam.id,
            studentId: studentId,
            rawScore: Number(gradeValue),
          },
          teacher.userId, // IMPORTANT: aggregation expects userId primarily
          teacher.schoolId,
        );
        results.push(result);
      } catch (error) {
        console.warn(`Failed to record grade for student ${studentId}:`, error);
        throw new BadRequestException(
          `Failed to record grade for student ${studentId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Sync into legacy Grade table so the existing exam results views (ExamResults.tsx) still show data
      try {
        // Find existing legacy grade row (by exam + student) if any
        let legacy = await this.gradeRepository.findOne({ where: { exam: { id: exam.id }, student: { studentId } }, relations: ['exam','student','course','class'] });
        if(!legacy){
          legacy = this.gradeRepository.create({
            grade: String(gradeValue),
            assessmentType: exam.examType,
            student: { id: (await this.studentRepository.findOne({ where: { studentId } }))!.id } as any,
            teacher: teacher as any,
            course: course as any,
            class: classEntity as any,
            exam: exam as any,
            schoolId: teacher.schoolId,
            termId: exam.TermId,
          });
        } else {
          legacy.grade = String(gradeValue);
          legacy.assessmentType = exam.examType;
          legacy.termId = exam.TermId;
        }
        await this.gradeRepository.save(legacy);
      } catch(syncErr){
        // Non-fatal; log only
        console.warn('[GradeService] Failed syncing legacy Grade table', syncErr);
      }
    }

    return {
      examId: exam.id,
      gradesRecorded: results.length,
      results: results,
    };
  }

  async getAllClasses(schoolId?: string): Promise<Class[]> {
    const where: any = {};
    if (schoolId) {
      where.schoolId = schoolId;
    }
    return this.classRepository.find({
      where,
      relations: ['students'],
    });
  }

  async getClassStudents(
    classId: string,
    userId: string,
    schoolId?: string,
    Term?: string,
    period?: string,
  ): Promise<Student[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const where: any = { id: classId };
    if (schoolId) {
      where.schoolId = schoolId;
    }

    const classEntity = await this.classRepository.findOne({
      where,
      relations: ['students', 'students.user'],
    });

    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    // Additional filtering of students by schoolId if provided
    if (schoolId) {
      return classEntity.students.filter(student => student.schoolId === schoolId);
    }

    return classEntity.students;
  }

  async getClassGrades(
    classId: string,
    userId: string,
    schoolId?: string,
    termId?: string,
    academicCalendarId?: string,
    Term?: string,
    period?: string,
  ): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Get all students in this class with their details
    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
      relations: ['students'],
    });

    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    // Create a map of student IDs to student details
    const studentDetailsMap = new Map<
      string,
      { studentId: string; firstName: string; lastName: string }
    >();
    classEntity.students.forEach((student) => {
      studentDetailsMap.set(student.id, {
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
      });
    });

  const query = this.gradeRepository
      .createQueryBuilder('grade')
      .leftJoinAndSelect('grade.student', 'student')
      .leftJoinAndSelect('grade.course', 'course')
      .leftJoinAndSelect('grade.exam', 'exam') // Join with exam to check status
      .where('grade.classId = :classId', { classId });

    // Add schoolId filtering for multi-tenancy
    if (schoolId) {
      query.andWhere('grade.schoolId = :schoolId', { schoolId });
    }

    // Only show results for administered exams
    query.andWhere('exam.status = :administeredStatus', { administeredStatus: 'administered' });

    if (Term) {
      query.andWhere('EXTRACT(YEAR FROM grade.date) = :year', {
        year: Term.split('-')[0],
      });
    }

    if (termId) {
      query.andWhere('grade.termId = :tid', { tid: termId });
    }
    if (academicCalendarId) {
      query.leftJoin('grade.term', 'tTerm').andWhere('tTerm.academicCalendarId = :acal', { acal: academicCalendarId });
    }

    const grades = await query.getMany();

    const studentResultsMap = new Map<string, any>();
    grades.forEach((grade) => {
      const studentDetails = studentDetailsMap.get(grade.student.id) || {
        studentId: 'N/A',
        firstName: 'Unknown',
        lastName: 'Student',
      };

      if (!studentResultsMap.has(studentDetails.studentId)) {
        studentResultsMap.set(studentDetails.studentId, {
          student: {
            id: grade.student.id,
            studentId: studentDetails.studentId,
            firstName: studentDetails.firstName,
            lastName: studentDetails.lastName,
          },
          results: [],
          totalMarks: 0,
          totalPossible: 0,
        });
      }

      const studentResult = studentResultsMap.get(studentDetails.studentId);
      const marks = parseFloat(grade.grade) || 0;

      studentResult.results.push({
        gradeId: grade.gradeId,
        examTitle: grade.course.name,
        subject: grade.course.name,
        marksObtained: marks,
        totalMarks: 100,
        percentage: marks,
        grade: 'TEMP', // placeholder, replaced later
        date: grade.date,
        examType: grade.assessmentType,
      });

      studentResult.totalMarks += marks;
      studentResult.totalPossible += 100;
    });

  let results = await Promise.all(Array.from(studentResultsMap.values()).map(
      async (studentResult) => {
        const totalMarks = studentResult.results.reduce(
          (sum, exam) => sum + exam.marksObtained,
          0,
        );
        const totalPossible = studentResult.results.reduce(
          (sum, exam) => sum + exam.totalMarks,
          0,
        );
        const averageScore =
          totalPossible > 0 ? (totalMarks / totalPossible) * 100 : 0;

        // Resolve dynamic letter grades
        for (const r of studentResult.results) {
          r.grade = await this.calculateLetterGradeDynamic(r.percentage, schoolId);
        }

        const overallGPA = await this.calculateGPA(studentResult.results, schoolId);

        return {
          ...studentResult,
          totalMarks,
          totalPossible,
          averageScore,
          overallGPA,
          totalExams: studentResult.results.length,
          remarks: this.getRemarks(averageScore),
        };
      },
    ));

    // Fallback / augmentation using aggregated exam_result when:
    // 1. No legacy grades found for this class & a termId is supplied, OR
    // 2. Explicit aggregated context (termId provided) even if some grades exist – merge aggregated finals as summary rows
    if ((results.length === 0 && termId) || termId) {
      try {
        // Collect courseIds for this class
        const courseIds = (await this.courseRepository.find({ where: { classId: classEntity.id } })).map(c=> c.id);
        const aggregatedByStudent: Record<string, { totals:number; entries:number; finals:any[] }> = {};
        for (const cid of courseIds) {
          const agg = await this.aggregationService.getResultsForCourseTerm(cid, termId!);
          for (const row of agg) {
            if (!aggregatedByStudent[row.studentId]) aggregatedByStudent[row.studentId] = { totals:0, entries:0, finals: [] };
            const pct = row.finalPercentage? parseFloat(row.finalPercentage): null;
            if (pct!=null){
              aggregatedByStudent[row.studentId].totals += pct;
              aggregatedByStudent[row.studentId].entries += 1;
            }
            aggregatedByStudent[row.studentId].finals.push(row);
          }
        }

        // Create student lookup from actual class students
        const studentLookup = new Map<string, any>();
        classEntity.students.forEach(student => {
          studentLookup.set(student.id, student);
        });

        // Merge into results map (create student rows if missing)
        const resultsByStudentId = new Map(results.map(r=> [r.student.studentId, r]));
        for (const [studentUuid, aggData] of Object.entries(aggregatedByStudent)) {
          const avg = aggData.entries>0? (aggData.totals/aggData.entries): 0;
          const studentInfo = studentLookup.get(studentUuid);
          if (!studentInfo) continue; // Skip if student not in class
          
          if (!resultsByStudentId.has(studentInfo.studentId)) {
            results.push({
              student: { 
                id: studentInfo.id, 
                studentId: studentInfo.studentId, 
                firstName: studentInfo.firstName, 
                lastName: studentInfo.lastName 
              },
              results: [],
              totalMarks: avg, // interpret as avg for compatibility
              totalPossible: 100,
              averageScore: avg,
              overallGPA: await this.calculateGPA([{ percentage: avg, grade: await this.calculateLetterGradeDynamic(avg, schoolId) } as any], schoolId),
              totalExams: aggData.entries,
              remarks: this.getRemarks(avg),
              aggregatedFinals: aggData.finals,
              aggregated: true,
            });
          } else {
            const existing = resultsByStudentId.get(studentInfo.studentId)!;
            existing.aggregatedFinals = aggData.finals;
            existing.aggregated = true;
            // Optionally update average if no legacy grades
            if (existing.totalExams === 0) {
              existing.averageScore = avg;
              existing.totalMarks = avg;
              existing.totalPossible = 100;
              existing.overallGPA = await this.calculateGPA([{ percentage: avg, grade: await this.calculateLetterGradeDynamic(avg, schoolId) } as any], schoolId);
              existing.remarks = this.getRemarks(avg);
            }
          }
        }
      } catch (e) {
        // Non-fatal; log server side
        // eslint-disable-next-line no-console
        console.warn('[GradeService] Aggregated fallback failed', e);
      }
    }

    return {
      classInfo: {
        id: classEntity.id,
        name: classEntity.name,
      },
      students: results,
    };
  }

  async getStudentGrades(
    studentId: string,
    userId?: string,
    classId?: string,
    termId?: string,
    academicCalendarId?: string,
    Term?: string, // legacy year-based filter
    period?: string,
  ): Promise<any> {
    if (userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
    }

    // Find student by UUID (id)
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
      relations: ['user'],
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Create query using student's id for grades
    const query = this.gradeRepository
      .createQueryBuilder('grade')
      .leftJoinAndSelect('grade.course', 'course')
      .leftJoinAndSelect('grade.class', 'class')
      .leftJoinAndSelect('grade.term', 'term')
      .leftJoinAndSelect('grade.exam', 'exam') // Join with exam to check status
      .where('grade.student = :studentId', { studentId: student.id });

    // Strictly scope to current class if provided (prevents historical class grades leaking)
    if (classId) {
      query.andWhere('grade.classId = :classId', { classId });
    }

    // Only show results for administered exams
    query.andWhere('exam.status = :administeredStatus', { administeredStatus: 'administered' });

    // Direct term filter (preferred)
    if (termId) {
      query.andWhere('grade.termId = :termId', { termId });
    }

    // Academic calendar filter via joined term
    if (academicCalendarId) {
      // Term has foreign key academicCalendarId generated by TypeORM
      query.andWhere('term.academicCalendarId = :academicCalendarId', { academicCalendarId });
    }

    // Legacy year-based filter retained for backward compatibility
    if (Term) {
      try {
        const year = Term.split('-')[0];
        if (year) {
          query.andWhere('EXTRACT(YEAR FROM grade.date) = :year', { year });
        }
      } catch (_) {
        // ignore malformed legacy Term param
      }
    }

  const grades = await query.getMany();

  // If any term referenced has not published results, hide those grades
  const visibleGrades = grades.filter(g => !g.termId || g.term?.resultsPublished);

  const results = await Promise.all(visibleGrades.map(async (grade) => ({
      gradeId: grade.gradeId,
      examTitle: grade.course.name,
      subject: grade.course.name,
      termId: grade.termId,
      marksObtained: parseFloat(grade.grade) || 0,
      totalMarks: 100,
      percentage: parseFloat(grade.grade) || 0,
      grade: await this.calculateLetterGradeDynamic(parseFloat(grade.grade) || 0, grade.schoolId),
      date: grade.date,
      examType: grade.assessmentType,
    })));

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
      },
      results,
  overallGPA: await this.calculateGPA(results, student.schoolId),
  totalExams: results.length,
  hiddenResults: grades.length - visibleGrades.length,
    };
  }

  async getStudentOwnGrades(userId: string): Promise<any> {
    // Find student by user ID
    const student = await this.studentRepository.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Get all grades for this student, filtered by schoolId for multi-tenancy and exam status
    const grades = await this.gradeRepository
      .createQueryBuilder('grade')
      .leftJoinAndSelect('grade.course', 'course')
      .leftJoinAndSelect('grade.class', 'class')
      .leftJoinAndSelect('grade.term', 'term')
      .leftJoinAndSelect('grade.exam', 'exam') // Join with exam to check status
      .where('grade.student = :studentId', { studentId: student.id })
      .andWhere('grade.schoolId = :schoolId', { schoolId: student.schoolId })
      .andWhere('exam.status = :administeredStatus', { administeredStatus: 'administered' })
      .getMany();

    const visibleGrades = grades.filter(g => !g.termId || g.term?.resultsPublished);

  const results = await Promise.all(visibleGrades.map(async (grade) => ({
      gradeId: grade.gradeId,
      examTitle: grade.course.name,
      subject: grade.course.name,
      marksObtained: parseFloat(grade.grade) || 0,
      totalMarks: 100,
      percentage: parseFloat(grade.grade) || 0,
      grade: await this.calculateLetterGradeDynamic(parseFloat(grade.grade) || 0, grade.schoolId),
      date: grade.date,
      examType: grade.assessmentType,
      termId: grade.termId,
      term: grade.term ? {
        id: grade.term.id,
        name: `Term ${grade.term.termNumber}`,
        termNumber: grade.term.termNumber,
      } : null,
    })));

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
      },
      results,
  overallGPA: await this.calculateGPA(results, student.schoolId),
  totalExams: results.length,
  hiddenResults: grades.length - visibleGrades.length,
    };
  }

  private getRemarks(averageScore: number): string {
    if (averageScore >= 90) return 'Excellent';
    if (averageScore >= 80) return 'Very Good';
    if (averageScore >= 70) return 'Good';
    if (averageScore >= 60) return 'Satisfactory';
    return 'Needs Improvement';
  }

  private async resolveGradeFormats(schoolId?: string | null): Promise<GradeFormat[]> {
    // Try school-specific active formats first
    let formats: GradeFormat[] = [];
    if (schoolId) {
      formats = await this.gradeFormatRepository.find({ where: { schoolId, isActive: true }, order: { minPercentage: 'DESC' } });
    }
    if (formats.length === 0) {
      formats = await this.gradeFormatRepository.find({ where: { schoolId: IsNull(), isActive: true }, order: { minPercentage: 'DESC' } });
    }
    return formats;
  }

  private async calculateLetterGradeDynamic(percentage: number, schoolId?: string | null): Promise<string> {
    const formats = await this.resolveGradeFormats(schoolId);
    for (const f of formats) {
      if (percentage >= f.minPercentage && percentage <= f.maxPercentage) return f.grade;
    }
    // Fallback simple scale
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  }

  private async calculateGPA(grades: any[], schoolId?: string | null): Promise<number> {
    if (grades.length === 0) return 0;
    const formats = await this.resolveGradeFormats(schoolId);
    const findGpa = (percentage: number): number => {
      const fmt = formats.find(f => percentage >= f.minPercentage && percentage <= f.maxPercentage);
      if (fmt) return Number(fmt.gpa);
      if (percentage >= 90) return 4;
      if (percentage >= 80) return 3;
      if (percentage >= 70) return 2;
      if (percentage >= 60) return 1;
      return 0;
    };
    const total = grades.reduce((sum, g) => sum + findGpa(g.percentage || 0), 0);
    return total / grades.length;
  }

  /**
   * Flexible multi-student / multi-term / academic calendar report
   */
  async getGradesReport(
    query: GradesReportQueryDto,
    requestingUserId: string,
    schoolId: string,
  ): Promise<any> {
    // Basic auth presence check
    const user = await this.userRepository.findOne({ where: { id: requestingUserId } });
    if (!user) throw new UnauthorizedException('Requesting user not found');

    const {
      studentIds = [],
      classId,
      termIds = [],
      academicCalendarId,
      termNumbers = [],
      combineTerms = false,
      includeTermBreakdown = true,
      aggregateTerms = false,
      includeUnpublished = false,
    } = query;

    const effectiveCombine = combineTerms || aggregateTerms;

    // Derive effective term IDs if academic calendar specified
    let effectiveTermIds = [...termIds];
    let academicCalendar = null as AcademicCalendar | null;
    if (academicCalendarId) {
      academicCalendar = await this.academicCalendarRepository.findOne({ where: { id: academicCalendarId, schoolId } });
      if (!academicCalendar) throw new BadRequestException('Academic calendar not found for school');
      if (effectiveTermIds.length === 0) {
        const termWhere: any = { schoolId, academicCalendar: { id: academicCalendarId } };
        const calendarTerms = await this.termRepository.find({ where: termWhere });
        const filtered = termNumbers.length > 0 ? calendarTerms.filter(t => termNumbers.includes(t.termNumber)) : calendarTerms;
        effectiveTermIds = filtered.map(t => t.id);
      }
    }

    if (effectiveTermIds.length === 0) {
      throw new BadRequestException('You must specify termIds or an academicCalendarId (optionally with termNumbers).');
    }

    // Resolve students (support both internal UUID and external studentId code).
    let resolvedStudentIds: string[] = [];
    if (studentIds.length > 0) {
      const students = await this.studentRepository.find({ where: [
        { id: In(studentIds) },
        { studentId: In(studentIds) },
      ] });
      resolvedStudentIds = students.map(s => s.id);
      if (resolvedStudentIds.length === 0) {
        throw new BadRequestException('No matching students found for provided identifiers');
      }
    }

    // If class specified and no specific students requested, get all class students
    if (classId && resolvedStudentIds.length === 0) {
      const classEntity = await this.classRepository.findOne({ where: { id: classId }, relations: ['students'] });
      if (!classEntity) throw new NotFoundException('Class not found');
      resolvedStudentIds = classEntity.students.map(s => s.id);
    }

    // Query exam results instead of grades
    const qb = this.examResultRepository.createQueryBuilder('examResult')
      .leftJoinAndSelect('examResult.student', 'student')
      .leftJoinAndSelect('examResult.course', 'course')
      .leftJoinAndSelect('examResult.term', 'term')
      .leftJoinAndSelect('examResult.school', 'school')
      .where('examResult.schoolId = :schoolId', { schoolId })
      .andWhere('examResult.termId IN (:...termIds)', { termIds: effectiveTermIds });

    if (resolvedStudentIds.length > 0) {
      qb.andWhere('student.id IN (:...studentIds)', { studentIds: resolvedStudentIds });
    }
    if (classId) {
      // Get students in the class and filter by them
      const classEntity = await this.classRepository.findOne({ 
        where: { id: classId }, 
        relations: ['students'] 
      });
      if (classEntity) {
        const classStudentIds = classEntity.students.map(s => s.id);
        qb.andWhere('student.id IN (:...classStudentIds)', { classStudentIds });
      }
    }

    const rawResults = await qb.getMany();

    // Hide results for unpublished terms
    const fetchedTerms = await this.termRepository.find({ where: { id: In(effectiveTermIds) } });
    const publishedTermIds = new Set(
      fetchedTerms.filter(t => t.resultsPublished).map(t => t.id)
    );
    const isPrivilegedViewer = ['ADMIN', 'SUPER_ADMIN'].includes((user as any).role);
    const examResults = (includeUnpublished || isPrivilegedViewer)
      ? rawResults
      : rawResults.filter(r => !r.termId || publishedTermIds.has(r.termId));

    // Grouping structures
    interface TermGroup { termId: string; termNumber?: number; assessments: any[]; totalMarks: number; totalPossible: number; averagePercentage: number; gpa: number; }
    const studentsMap = new Map<string, { student: any; terms: Map<string, TermGroup> }>();

    for (const examResult of examResults) {
      const sid = examResult.student.id;
      if (!studentsMap.has(sid)) {
        // Get the student's class information from enrollment or other means
        const studentClass = await this.classRepository
          .createQueryBuilder('class')
          .innerJoin('class.students', 'student')
          .where('student.id = :studentId', { studentId: sid })
          .getOne();

        studentsMap.set(sid, {
          student: {
            id: examResult.student.id,
            studentId: examResult.student.studentId,
            firstName: examResult.student.firstName,
            lastName: examResult.student.lastName,
            classId: studentClass?.id || null,
            className: studentClass?.name || null,
          },
          terms: new Map(),
        });
      }
      const studentEntry = studentsMap.get(sid)!;
      const tId = examResult.termId || 'unassigned';
      if (!studentEntry.terms.has(tId)) {
        studentEntry.terms.set(tId, {
          termId: tId,
          termNumber: examResult.term?.termNumber,
          assessments: [],
          totalMarks: 0,
          totalPossible: 0,
          averagePercentage: 0,
          gpa: 0,
        });
      }
      const termGroup = studentEntry.terms.get(tId)!;
      const percentage = parseFloat(examResult.finalPercentage || '0') || 0;
      termGroup.assessments.push({
        gradeId: examResult.id,
        examTitle: examResult.course?.name,
        subject: examResult.course?.name,
        marksObtained: percentage, // Using percentage as marks for now
        totalMarks: 100,
        percentage: percentage,
        grade: examResult.finalGradeCode || 'TEMP',
        date: examResult.updatedAt,
        examType: 'EXAM',
        termId: examResult.termId,
        termNumber: examResult.term?.termNumber,
      });
      termGroup.totalMarks += percentage;
      termGroup.totalPossible += 100;
    }

    // Finalize term stats
    const responseStudents: any[] = [];
    studentsMap.forEach((entry) => {
      const termObjects = Array.from(entry.terms.values()).map(t => {
        t.averagePercentage = t.totalPossible > 0 ? (t.totalMarks / t.totalPossible) * 100 : 0;
        return t;
      });

      let combined: any = null;
  if (effectiveCombine && termObjects.length > 0) {
        const allAssessments = termObjects.flatMap(t => t.assessments);
        const totalMarks = allAssessments.reduce((s,a)=>s+a.marksObtained,0);
        const totalPossible = allAssessments.length * 100;
        const averagePercentage = totalPossible > 0 ? (totalMarks / totalPossible) * 100 : 0;
        combined = {
          termIds: termObjects.map(t=>t.termId),
          assessments: allAssessments,
          totalMarks,
          totalPossible,
          averagePercentage,
          gpa: 0, // filled later
          remarks: this.getRemarks(averagePercentage),
        };
      }

      responseStudents.push({
        student: entry.student,
        terms: includeTermBreakdown ? termObjects : undefined,
        combined,
      });
    });

    // Resolve dynamic grades & GPA post processing
    for (const student of responseStudents) {
      for (const term of (student.terms || [])) {
        for (const a of term.assessments) {
          a.grade = await this.calculateLetterGradeDynamic(a.percentage, schoolId);
        }
        term.gpa = await this.calculateGPA(term.assessments, schoolId);
      }
      if (student.combined) {
        for (const a of student.combined.assessments) {
          a.grade = await this.calculateLetterGradeDynamic(a.percentage, schoolId);
        }
        student.combined.gpa = await this.calculateGPA(student.combined.assessments, schoolId);
      }
    }

    return {
      metadata: {
        academicCalendarId: academicCalendar?.id || academicCalendarId || null,
        termIds: effectiveTermIds,
  combineTerms: effectiveCombine,
        includeTermBreakdown,
  includeUnpublished: includeUnpublished || isPrivilegedViewer,
        totalStudents: responseStudents.length,
        generatedAt: new Date().toISOString(),
      },
      students: responseStudents,
    };
  }

  async getFilteredResults(
    userId: string,
    schoolId: string | undefined,
    filters: {
      classId?: string;
      academicCalendarId?: string;
      termId?: string;
      studentId?: string;
      examId?: string;
      examType?: string;
      search?: string;
      minGrade?: number;
      maxGrade?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<any> {
    // Special case: if only examId is provided, return count of graded students for exam details
    console.log(`[DEBUG] getFilteredResults called with filters:`, JSON.stringify(filters));
    if (filters.examId && !filters.studentId && !filters.classId && !filters.termId && !filters.academicCalendarId && !filters.examType && !filters.search && filters.minGrade === undefined && filters.maxGrade === undefined && !filters.startDate && !filters.endDate) {
      console.log(`[DEBUG] Special case triggered for examId: ${filters.examId}, schoolId: ${schoolId}`);
      const qb = this.examGradeRecordRepository.createQueryBuilder('eg')
        .select('COUNT(DISTINCT eg.studentId)', 'gradedCount')
        .where('eg.examId = :examId', { examId: filters.examId })
        .andWhere('eg.status = :status', { status: 'PUBLISHED' });
      if (schoolId) {
        qb.andWhere('eg.schoolId = :schoolId', { schoolId });
      }
      const raw = await qb.getRawOne<{ gradedCount: string }>();
      const gradedCount = raw ? parseInt(raw.gradedCount, 10) : 0;
      console.log(`[DEBUG] Exam ${filters.examId} has ${gradedCount} distinct graded students`);
      return { gradedCount };
    }

    // Build the base query for legacy grade table (for other use cases)
    const query = this.gradeRepository
      .createQueryBuilder('grade')
      .leftJoinAndSelect('grade.student', 'student')
      .leftJoinAndSelect('grade.course', 'course')
      .leftJoinAndSelect('grade.class', 'class')
      .leftJoinAndSelect('grade.term', 'term')
      .leftJoinAndSelect('grade.exam', 'exam')
      .where('exam.status IN (:...statuses)', { statuses: ['administered', 'graded'] });

    // Add school scoping
    if (schoolId) {
      query.andWhere('grade.schoolId = :schoolId', { schoolId });
    }

    // Apply filters
    if (filters.classId) {
      query.andWhere('grade.classId = :classId', { classId: filters.classId });
    }

    if (filters.termId) {
      query.andWhere('grade.termId = :termId', { termId: filters.termId });
    }

    if (filters.academicCalendarId) {
      query.andWhere('term.academicCalendarId = :academicCalendarId', {
        academicCalendarId: filters.academicCalendarId
      });
    }

    if (filters.studentId) {
      query.andWhere('grade.student = :studentId', { studentId: filters.studentId });
    }

    if (filters.examId) {
      query.andWhere('grade.examId = :examId', { examId: filters.examId });
    }

    if (filters.examType) {
      query.andWhere('grade.assessmentType = :examType', { examType: filters.examType });
    }

    if (filters.minGrade !== undefined) {
      query.andWhere('CAST(grade.grade AS DECIMAL) >= :minGrade', { minGrade: filters.minGrade });
    }

    if (filters.maxGrade !== undefined) {
      query.andWhere('CAST(grade.grade AS DECIMAL) <= :maxGrade', { maxGrade: filters.maxGrade });
    }

    if (filters.startDate) {
      query.andWhere('grade.date >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      query.andWhere('grade.date <= :endDate', { endDate: filters.endDate });
    }

    if (filters.search) {
      query.andWhere(
        '(student.firstName ILIKE :search OR student.lastName ILIKE :search OR student.studentId ILIKE :search OR course.name ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Execute query
    const grades = await query.getMany();

    // Group by student for class view, or return individual results for student view
    if (filters.studentId) {
      // Individual student results
      const results = await Promise.all(grades.map(async (grade) => ({
        id: grade.gradeId,
        examTitle: grade.course.name,
        subject: grade.course.name,
        marksObtained: parseFloat(grade.grade) || 0,
        totalMarks: 100,
        percentage: parseFloat(grade.grade) || 0,
        grade: await this.calculateLetterGradeDynamic(parseFloat(grade.grade) || 0, grade.schoolId),
        date: grade.date,
        examType: grade.assessmentType,
        termId: grade.termId,
        term: grade.term ? {
          id: grade.term.id,
          name: `Term ${grade.term.termNumber}`,
          termNumber: grade.term.termNumber,
        } : null,
      })));

      return {
        student: {
          id: grades[0]?.student.id,
          firstName: grades[0]?.student.firstName,
          lastName: grades[0]?.student.lastName,
          studentId: grades[0]?.student.studentId,
        },
        results,
        overallGPA: await this.calculateGPA(results, grades[0]?.schoolId),
        totalExams: results.length,
      };
    } else {
      // Class results - group by student
      const studentMap = new Map<string, any>();

      for (const grade of grades) {
        const studentId = grade.student.id;
        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            student: {
              id: grade.student.id,
              studentId: grade.student.studentId,
              firstName: grade.student.firstName,
              lastName: grade.student.lastName,
            },
            results: [],
            totalMarks: 0,
            totalPossible: 0,
          });
        }

        const studentData = studentMap.get(studentId);
        const marks = parseFloat(grade.grade) || 0;

        const result = {
          id: grade.gradeId,
          examTitle: grade.course.name,
          subject: grade.course.name,
          marksObtained: marks,
          totalMarks: 100,
          percentage: marks,
          grade: await this.calculateLetterGradeDynamic(marks, grade.schoolId),
          date: grade.date,
          examType: grade.assessmentType,
        };

        studentData.results.push(result);
        studentData.totalMarks += marks;
        studentData.totalPossible += 100;
      }

      // Calculate final metrics for each student
      const students = await Promise.all(Array.from(studentMap.values()).map(async (studentData) => {
        const averageScore = studentData.totalPossible > 0
          ? (studentData.totalMarks / studentData.totalPossible) * 100
          : 0;

        return {
          ...studentData,
          averageScore,
          overallGPA: await this.calculateGPA(studentData.results, schoolId),
          totalExams: studentData.results.length,
          remarks: this.getRemarks(averageScore),
        };
      }));

      return {
        classInfo: filters.classId ? { id: filters.classId } : null,
        students,
        filters: {
          applied: Object.fromEntries(
            Object.entries(filters).filter(([_, value]) => value !== undefined && value !== '')
          ),
          totalResults: students.length,
        },
      };
    }
  }

  async exportToCSV(data: any): Promise<string> {
    const rows: string[] = [];

    if (data.student) {
      // Individual student export
      rows.push('Student ID,Student Name,Exam Title,Subject,Exam Type,Date,Marks Obtained,Total Marks,Percentage,Grade');

      data.results.forEach((result: any) => {
        rows.push([
          data.student.studentId,
          `${data.student.firstName} ${data.student.lastName}`,
          result.examTitle,
          result.subject,
          result.examType,
          result.date,
          result.marksObtained,
          result.totalMarks,
          result.percentage,
          result.grade,
        ].join(','));
      });
    } else {
      // Class export
      rows.push('Student ID,Student Name,Average Score,Overall GPA,Total Exams,Remarks');

      data.students.forEach((student: any) => {
        rows.push([
          student.student.studentId,
          `${student.student.firstName} ${student.student.lastName}`,
          student.averageScore.toFixed(1),
          student.overallGPA.toFixed(1),
          student.totalExams,
          student.remarks,
        ].join(','));
      });
    }

    return rows.join('\n');
  }

  async exportToExcel(data: any): Promise<Buffer> {
    // For now, return CSV as Excel format (can be enhanced with actual Excel library later)
    const csv = await this.exportToCSV(data);
    return Buffer.from(csv, 'utf-8');
  }
}