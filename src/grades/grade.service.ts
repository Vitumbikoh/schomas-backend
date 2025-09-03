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
  ) {}

  async createGrades(
    createGradeDto: CreateGradeDto,
    userId: string,
  ): Promise<Grade[]> {
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

    // Validate assessment type
    const validAssessmentTypes = [
      'midperiod',
      'endperiod',
      'quiz',
      'assignment',
      'practical',
    ];
    if (!validAssessmentTypes.includes(assessmentType)) {
      throw new BadRequestException('Invalid assessment type');
    }

    // Get all enrolled student IDs for this course
    const enrolledStudentIds =
      course.enrollments?.map((e) => e.student.studentId) || [];

    // Create grade records
    const gradeRecords: Grade[] = [];
    for (const [studentId, gradeValue] of Object.entries(grades)) {
      // Check if student is enrolled in course
      if (!enrolledStudentIds.includes(studentId)) {
        throw new BadRequestException(
          `Student ${studentId} is not enrolled in this course`,
        );
      }

      // Fetch Student entity by studentId
      const student = await this.studentRepository.findOne({
        where: { studentId },
      });
      if (!student) {
        throw new BadRequestException(`Invalid student ID: ${studentId}`);
      }

      const gradeRecord = new Grade();
      gradeRecord.student = student; // Set the Student entity directly
      // gradeRecord.teacher = teacher; // Set the Teacher entity
      gradeRecord.course = course;
      gradeRecord.class = classEntity;
      gradeRecord.assessmentType = assessmentType;
      gradeRecord.grade = String(gradeValue);
      gradeRecord.date = new Date();
  // multi-tenant context
  gradeRecord.schoolId = classEntity.schoolId || course.schoolId || user.schoolId || undefined;

      gradeRecords.push(gradeRecord);
    }

    // Save to database
    return this.gradeRepository.save(gradeRecords);
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
      .where('grade.classId = :classId', { classId });

    // Add schoolId filtering for multi-tenancy
    if (schoolId) {
      query.andWhere('grade.schoolId = :schoolId', { schoolId });
    }

    if (Term) {
      query.andWhere('EXTRACT(YEAR FROM grade.date) = :year', {
        year: Term.split('-')[0],
      });
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

    const results = await Promise.all(Array.from(studentResultsMap.values()).map(
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
    Term?: string,
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
      .where('grade.student = :studentId', { studentId: student.id });

    if (classId) {
      query.andWhere('grade.classId = :classId', { classId });
    }
    if (Term) {
      query.andWhere('EXTRACT(YEAR FROM grade.date) = :year', {
        year: Term.split('-')[0],
      });
    }

  const grades = await query.getMany();

  // If any term referenced has not published results, hide those grades
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

    // Get all grades for this student, filtered by schoolId for multi-tenancy
    const grades = await this.gradeRepository.find({
      where: { 
        student: { id: student.id },
        schoolId: student.schoolId,
      },
      relations: ['course', 'class', 'term'],
    });

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

    // Query grades
    const qb = this.gradeRepository.createQueryBuilder('grade')
      .leftJoinAndSelect('grade.student', 'student')
      .leftJoinAndSelect('grade.course', 'course')
      .leftJoinAndSelect('grade.class', 'class')
      .leftJoinAndSelect('grade.term', 'term')
      .where('grade.schoolId = :schoolId', { schoolId })
      .andWhere('grade.termId IN (:...termIds)', { termIds: effectiveTermIds });

    if (resolvedStudentIds.length > 0) {
      qb.andWhere('student.id IN (:...studentIds)', { studentIds: resolvedStudentIds });
    }
    if (classId) {
      qb.andWhere('class.id = :classId', { classId });
    }

    const rawGrades = await qb.getMany();

    // Hide grades for unpublished terms
    const fetchedTerms = await this.termRepository.find({ where: { id: In(effectiveTermIds) } });
    const publishedTermIds = new Set(
      fetchedTerms.filter(t => t.resultsPublished).map(t => t.id)
    );
    const isPrivilegedViewer = ['ADMIN', 'SUPER_ADMIN'].includes((user as any).role);
    const grades = (includeUnpublished || isPrivilegedViewer)
      ? rawGrades
      : rawGrades.filter(g => !g.termId || publishedTermIds.has(g.termId));

    // Grouping structures
    interface TermGroup { termId: string; termNumber?: number; assessments: any[]; totalMarks: number; totalPossible: number; averagePercentage: number; gpa: number; }
    const studentsMap = new Map<string, { student: any; terms: Map<string, TermGroup> }>();

    for (const grade of grades) {
      const sid = grade.student.id;
      if (!studentsMap.has(sid)) {
        studentsMap.set(sid, {
          student: {
            id: grade.student.id,
            studentId: grade.student.studentId,
            firstName: grade.student.firstName,
            lastName: grade.student.lastName,
            classId: grade.class?.id || null,
            className: grade.class?.name || null,
          },
          terms: new Map(),
        });
      }
      const studentEntry = studentsMap.get(sid)!;
      const tId = grade.termId || 'unassigned';
      if (!studentEntry.terms.has(tId)) {
        studentEntry.terms.set(tId, {
          termId: tId,
            termNumber: grade.term?.termNumber,
            assessments: [],
            totalMarks: 0,
            totalPossible: 0,
            averagePercentage: 0,
            gpa: 0,
        });
      }
      const termGroup = studentEntry.terms.get(tId)!;
      const marks = parseFloat(grade.grade) || 0;
      termGroup.assessments.push({
        gradeId: grade.gradeId,
        examTitle: grade.course?.name,
        subject: grade.course?.name,
        marksObtained: marks,
        totalMarks: 100,
        percentage: marks,
        grade: 'TEMP',
        date: grade.date,
        examType: grade.assessmentType,
        termId: grade.termId,
        termNumber: grade.term?.termNumber,
      });
      termGroup.totalMarks += marks;
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
}