import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { Student } from '../user/entities/student.entity';
import { Class } from '../classes/entity/class.entity';
import { Course } from '../course/entities/course.entity';
import { User } from '../user/entities/user.entity';
import { Term } from '../settings/entities/term.entity';
import { GradeFormat } from '../grades/entity/grade-format.entity';

@Injectable()
export class ExamResultService {
  constructor(
    @InjectRepository(ExamResultAggregate)
    private examResultRepository: Repository<ExamResultAggregate>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Term)
    private termRepository: Repository<Term>,
    @InjectRepository(GradeFormat)
    private gradeFormatRepository: Repository<GradeFormat>,
  ) {}

  /**
   * Helper method to find student by userId
   */
  async findStudentByUserId(userId: string) {
    return this.studentRepository.findOne({ where: { userId } });
  }

  /**
   * Get aggregated exam results for a specific student
   */
  async getStudentResults(
    studentId: string,
    userId: string,
    classId?: string,
    termId?: string,
    academicCalendarId?: string,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Get student details
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
      relations: ['class'],
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Build query for student's exam results
    // First get the student to find their studentId
    const studentRecord = await this.studentRepository.findOne({ where: { id: studentId } });
    if (!studentRecord) {
      throw new NotFoundException('Student not found');
    }

    // Query by the student's studentId to handle cases where there might be multiple records
    let query = this.examResultRepository
      .createQueryBuilder('er')
      .leftJoinAndSelect('er.student', 'student')  
      .leftJoinAndSelect('er.course', 'course')
      .leftJoinAndSelect('er.term', 'term')
      .where('student.studentId = :studentId', { studentId: studentRecord.studentId })
      .andWhere('er.status IN (:...statuses)', { statuses: ['COMPLETE', 'PENDING'] });

    // Add filtering conditions
    if (student.schoolId) {
      query = query.andWhere('er.schoolId = :schoolId', { schoolId: student.schoolId });
    }

    // For students, only show results if they are published
    // Admins and teachers can see unpublished results
    if (user.role === 'STUDENT') {
      query = query.andWhere('term.resultsPublished = :published', { published: true });
    }

    // Note: Do not hard-filter by course.classId; we already scoped to student's class via student ids
    // Some courses may not have the classId set or may be cross-listed; filtering here can hide valid results

    if (termId) {
      query = query.andWhere('er.termId = :termId', { termId });
    }

    if (academicCalendarId) {
      query = query.andWhere('term.academicCalendarId = :academicCalendarId', { 
        academicCalendarId 
      });
    }

    const examResults = await query.getMany();
    console.log('Student Results Query Debug:', {
      requestedStudentId: studentId,
      studentRecord: {
        id: studentRecord.id,
        studentId: studentRecord.studentId,
        name: `${studentRecord.firstName} ${studentRecord.lastName}`
      },
      totalResults: examResults.length,
      sampleResult: examResults[0] ? {
        finalPercentage: examResults[0].finalPercentage,
        status: examResults[0].status,
        courseName: examResults[0].course?.name,
        termNumber: examResults[0].term?.termNumber
      } : null
    });

    // Transform results for frontend consumption
    const results = examResults.map(result => ({
      id: result.id,
      courseId: result.courseId,
      courseName: result.course?.name || 'Unknown Course',
      courseCode: result.course?.code || '',
      termId: result.termId,
      termName: result.term ? `Term ${result.term.termNumber}` : 'Unknown Term',
      finalPercentage: result.finalPercentage ? parseFloat(result.finalPercentage) : 0,
      finalGradeCode: result.finalGradeCode || 'N/A',
      pass: result.pass,
      breakdown: result.breakdown,
      computedAt: result.computedAt,
      schemeVersion: result.schemeVersion,
      status: result.status, // Include status for debugging
    }));

    // Calculate summary statistics (only include results with actual percentages)
    const resultsWithScores = results.filter(r => r.finalPercentage > 0);
    const totalResults = results.length;
    const averageScore = resultsWithScores.length > 0 
      ? resultsWithScores.reduce((sum, r) => sum + r.finalPercentage, 0) / resultsWithScores.length 
      : 0;

// Calculate GPA using grading formats instead of hardcoded values
    const gpaPromises = resultsWithScores.map(async result => {
      // Use student's schoolId if available, otherwise use user's schoolId
      const schoolIdToUse = student?.schoolId || user?.schoolId;
      return await this.getGpaFromPercentage(result.finalPercentage, schoolIdToUse);
    });
    const gpaPoints = await Promise.all(gpaPromises);
    
    const overallGPA = gpaPoints.length > 0 
      ? gpaPoints.reduce((sum, gpa) => sum + gpa, 0) / gpaPoints.length 
      : 0;

    // Use grading format for remarks instead of hardcoded values
    const getRemarks = async (average: number) => {
      // Use student's schoolId if available, otherwise use user's schoolId
      const schoolIdToUse = student?.schoolId || user?.schoolId;
      return await this.getRemarksFromPercentage(average, schoolIdToUse);
    };
    
    return {
      student: {
        id: studentRecord.id,
        studentId: studentRecord.studentId,
        firstName: studentRecord.firstName,
        lastName: studentRecord.lastName,
        class: studentRecord.class,
      },
      summary: {
        totalResults,
        averageScore: Math.round(averageScore * 100) / 100,
        overallGPA: Math.round(overallGPA * 10) / 10,
        remarks: await getRemarks(averageScore),
        totalMarks: Math.round(averageScore),
        totalPossible: totalResults > 0 ? totalResults * 100 : 0,
      },
      results,
    };
  }

  /**
   * Get aggregated exam results for all students in a class
   */
  async getClassResults(
    classId: string,
    userId: string,
    schoolId?: string,
    termId?: string,
    academicCalendarId?: string,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Get class details with students
    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
      relations: ['students'],
    });

    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    console.log('Class Details:', {
      classId,
      className: classEntity.name,
      studentsCount: classEntity.students?.length || 0,
      studentIds: classEntity.students?.map(s => ({ id: s.id, studentId: s.studentId, name: `${s.firstName} ${s.lastName}` })) || []
    });

    // Additional debug: Check for any exam results with matching studentId values
    // Guard against empty student list and optional termId to avoid SQL errors
    let examResultsForStudentIds: ExamResultAggregate[] = [];
    const studentIdsForDebug = classEntity.students.map(s => s.studentId).filter(Boolean);
    if (studentIdsForDebug.length > 0) {
      let debugQuery = this.examResultRepository
        .createQueryBuilder('er')
        .leftJoinAndSelect('er.student', 'student')
        .where('student.studentId IN (:...studentIds)', { 
          studentIds: studentIdsForDebug
        });

      if (termId) {
        debugQuery = debugQuery.andWhere('er.termId = :termId', { termId });
      }

      examResultsForStudentIds = await debugQuery.getMany();
    }

    console.log('Direct studentId exam results check:', {
      searchingFor: classEntity.students.map(s => s.studentId),
      foundResults: examResultsForStudentIds.length,
      results: examResultsForStudentIds.map(er => ({
        examResultId: er.id,
        studentUUID: er.studentId,
        studentIdField: er.student?.studentId,
        studentName: er.student ? `${er.student.firstName} ${er.student.lastName}` : 'Unknown',
        percentage: er.finalPercentage,
        status: er.status
      }))
    });

    // Get all exam results for students in this class
    // Try multiple approaches to find matching results
    const classStudentIds = classEntity.students.map(s => s.studentId);
    const classStudentUUIDs = classEntity.students.map(s => s.id);
    
    // First try to match by studentId (human readable like "250002")
    let query = this.examResultRepository
      .createQueryBuilder('er')
      .leftJoinAndSelect('er.student', 'student')
      .leftJoinAndSelect('er.course', 'course')
      .leftJoinAndSelect('er.term', 'term')
      .where(
        '(student.studentId IN (:...studentIds) OR er.studentId IN (:...studentUUIDs))', 
        { 
          studentIds: classStudentIds,
          studentUUIDs: classStudentUUIDs
        }
      )
      .andWhere('er.status IN (:...statuses)', { statuses: ['COMPLETE', 'PENDING'] });

    // Add filtering conditions
    if (schoolId) {
      query = query.andWhere('er.schoolId = :schoolId', { schoolId });
    }

    // For students, only show results if they are published
    // Admins and teachers can see unpublished results
    if (user.role === 'STUDENT') {
      query = query.andWhere('term.resultsPublished = :published', { published: true });
    }

    // Do not apply additional course.classId filtering to avoid hiding results recorded for students in this class

    if (termId) {
      query = query.andWhere('er.termId = :termId', { termId });
    }

    if (academicCalendarId) {
      query = query.andWhere('term.academicCalendarId = :academicCalendarId', { 
        academicCalendarId 
      });
    }

    const examResults = await query.getMany();
    console.log('Class Results Query Debug:', {
      classId,
      totalResults: examResults.length,
      studentsInClass: classEntity.students.length,
      sampleResult: examResults[0] ? {
        finalPercentage: examResults[0].finalPercentage,
        status: examResults[0].status,
        courseName: examResults[0].course?.name,
        studentName: examResults[0].student?.firstName
      } : null
    });

    // Group results by both studentId and UUID for flexibility
    const resultsByStudentId = new Map<string, any[]>();
    const resultsByStudentUUID = new Map<string, any[]>();
    
    examResults.forEach(result => {
      // Group by human-readable studentId
      const studentId = result.student?.studentId;
      if (studentId) {
        if (!resultsByStudentId.has(studentId)) {
          resultsByStudentId.set(studentId, []);
        }
        resultsByStudentId.get(studentId)?.push(result);
      }
      
      // Group by UUID as fallback
      const studentUUID = result.studentId;
      if (studentUUID) {
        if (!resultsByStudentUUID.has(studentUUID)) {
          resultsByStudentUUID.set(studentUUID, []);
        }
        resultsByStudentUUID.get(studentUUID)?.push(result);
      }
    });

    // Process each student's results
    const studentResults = await Promise.all(classEntity.students.map(async student => {
      // Try to find results by studentId first, then by UUID
      let studentExamResults = resultsByStudentId.get(student.studentId) || [];
      
      // If no results found by studentId, try UUID
      if (studentExamResults.length === 0) {
        studentExamResults = resultsByStudentUUID.get(student.id) || [];
      }
      
      const foundByStudentId = (resultsByStudentId.get(student.studentId)?.length || 0) > 0;
      const foundByUUID = (resultsByStudentUUID.get(student.id)?.length || 0) > 0;
      
      console.log(`Processing student ${student.firstName} ${student.lastName} (${student.studentId} - ${student.id}):`, {
        totalExamResults: studentExamResults.length,
        foundByStudentId,
        foundByUUID,
        searchedStudentId: student.studentId,
        searchedUUID: student.id,
        examResults: studentExamResults.map(r => ({
          course: r.course?.name,
          percentage: r.finalPercentage,
          status: r.status,
          examStudentUUID: r.studentId,
          examStudentId: r.student?.studentId
        }))
      });
      
      // Calculate student's aggregated statistics (only include results with actual scores)
      const resultsWithScores = studentExamResults.filter(r => r.finalPercentage && parseFloat(r.finalPercentage) > 0);
      const totalResults = studentExamResults.length;
      const averageScore = resultsWithScores.length > 0 
        ? resultsWithScores.reduce((sum, r) => sum + parseFloat(r.finalPercentage), 0) / resultsWithScores.length 
        : 0;

// Calculate GPA using grading formats instead of hardcoded values
    const gpaPromises = resultsWithScores.map(async result => {
      // Use the provided schoolId parameter, or fall back to user's schoolId
      const schoolIdToUse = schoolId || user?.schoolId;
      return await this.getGpaFromPercentage(parseFloat(result.finalPercentage), schoolIdToUse);
    });
    const gpaPoints = await Promise.all(gpaPromises);
    
    const overallGPA = gpaPoints.length > 0 
      ? gpaPoints.reduce((sum, gpa) => sum + gpa, 0) / gpaPoints.length 
      : 0;

    // Use grading format for remarks instead of hardcoded values
    const getRemarks = async (average: number) => {
      // Use the provided schoolId parameter, or fall back to user's schoolId  
      const schoolIdToUse = schoolId || user?.schoolId;
      return await this.getRemarksFromPercentage(average, schoolIdToUse);
      };

      return {
        student: {
          id: student.id,
          studentId: student.studentId,
          firstName: student.firstName,
          lastName: student.lastName,
        },
        totalResults,
        averageScore: Math.round(averageScore * 100) / 100,
        overallGPA: Math.round(overallGPA * 10) / 10,
        remarks: await getRemarks(averageScore),
        resultsWithScoresCount: resultsWithScores.length, // Debug info
        results: studentExamResults.map(result => ({
          courseId: result.courseId,
          courseName: result.course?.name || 'Unknown Course',
          courseCode: result.course?.code || '',
          finalPercentage: result.finalPercentage ? parseFloat(result.finalPercentage) : 0,
          finalGradeCode: result.finalGradeCode || 'N/A',
          pass: result.pass,
          status: result.status, // Include status for debugging
        })),
      };
    }));

    return {
      classInfo: {
        id: classEntity.id,
        name: classEntity.name,
      },
      students: studentResults,
      summary: {
        totalStudents: classEntity.students.length,
        studentsWithResults: studentResults.filter(s => s.totalResults > 0).length,
      },
    };
  }

  /**
   * Debug method to check class and exam result relationships
   */
  async debugClassResults(classId: string, userId: string, termId?: string) {
    // Get class with students
    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
      relations: ['students'],
    });

    if (!classEntity) {
      return { error: 'Class not found' };
    }

    // Get all exam results for the term/academic calendar to see what students have results
    const allExamResults = await this.examResultRepository
      .createQueryBuilder('er')
      .leftJoinAndSelect('er.student', 'student')
      .leftJoinAndSelect('er.course', 'course')
      .leftJoinAndSelect('er.term', 'term')
      .where('er.termId = :termId', { termId: termId || '4f1e220d-d5f0-47fa-bdf6-0cc159cb3a83' })
      .getMany();

    // Get all classes to see the correct mappings
    const allClasses = await this.classRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.students', 'students')
      .getMany();

    // Map students with exam results to their classes
    const studentClassMapping = new Map();
    allClasses.forEach(cls => {
      cls.students?.forEach(student => {
        studentClassMapping.set(student.studentId, {
          className: cls.name,
          classId: cls.id,
          studentUUID: student.id
        });
      });
    });

    return {
      class: {
        id: classEntity.id,
        name: classEntity.name,
        studentsCount: classEntity.students.length,
        studentIds: classEntity.students.map(s => ({ 
          id: s.id, 
          studentId: s.studentId, 
          name: `${s.firstName} ${s.lastName}` 
        })),
      },
      examResultsInTerm: {
        total: allExamResults.length,
        studentsWithResults: allExamResults.map(er => {
          const classInfo = studentClassMapping.get(er.student?.studentId);
          return {
            examStudentUUID: er.studentId,
            studentIdField: er.student?.studentId,
            studentName: er.student ? `${er.student.firstName} ${er.student.lastName}` : 'Unknown',
            percentage: er.finalPercentage,
            actualClass: classInfo?.className || 'Unknown Class',
            actualClassId: classInfo?.classId || 'Unknown'
          };
        })
      },
      allClasses: allClasses.map(c => ({
        id: c.id,
        name: c.name,
        studentCount: c.students?.length || 0,
        studentIds: c.students?.map(s => s.studentId) || []
      })),
      termFilter: termId,
    };
  }

  /**
   * Helper method to resolve grade formats for a school (falls back to global defaults)
   */
  private async resolveGradeFormats(schoolId?: string | null): Promise<GradeFormat[]> {
    let formats: GradeFormat[] = [];
    
    // Try school-specific active formats first
    if (schoolId) {
      formats = await this.gradeFormatRepository.find({ 
        where: { schoolId, isActive: true }, 
        order: { minPercentage: 'DESC' } 
      });
    }
    
    // Fall back to global defaults if no school-specific formats
    if (formats.length === 0) {
      formats = await this.gradeFormatRepository.find({ 
        where: { schoolId: IsNull(), isActive: true }, 
        order: { minPercentage: 'DESC' } 
      });
    }
    
    // If still no formats, ensure global defaults exist and use them
    if (formats.length === 0) {
      // Initialize default formats if none exist at all
      await this.ensureDefaultGradeFormats();
      formats = await this.gradeFormatRepository.find({ 
        where: { schoolId: IsNull(), isActive: true }, 
        order: { minPercentage: 'DESC' } 
      });
    }
    
    return formats;
  }

  /**
   * Ensure default grade formats exist in the database
   */
  private async ensureDefaultGradeFormats(): Promise<void> {
    const existingCount = await this.gradeFormatRepository.count({ 
      where: { schoolId: IsNull() } 
    });
    
    if (existingCount === 0) {
      const defaultFormats = [
        { grade: 'A+', description: 'Distinction', minPercentage: 90, maxPercentage: 100, gpa: 4.0, isActive: true, schoolId: null },
        { grade: 'A', description: 'Excellent', minPercentage: 80, maxPercentage: 89, gpa: 3.7, isActive: true, schoolId: null },
        { grade: 'B+', description: 'Very Good', minPercentage: 75, maxPercentage: 79, gpa: 3.3, isActive: true, schoolId: null },
        { grade: 'B', description: 'Good', minPercentage: 70, maxPercentage: 74, gpa: 3.0, isActive: true, schoolId: null },
        { grade: 'C+', description: 'Credit', minPercentage: 65, maxPercentage: 69, gpa: 2.7, isActive: true, schoolId: null },
        { grade: 'C', description: 'Pass', minPercentage: 60, maxPercentage: 64, gpa: 2.3, isActive: true, schoolId: null },
        { grade: 'D+', description: 'Marginal Pass', minPercentage: 55, maxPercentage: 59, gpa: 2.0, isActive: true, schoolId: null },
        { grade: 'D', description: 'Poor Pass', minPercentage: 50, maxPercentage: 54, gpa: 1.7, isActive: true, schoolId: null },
        { grade: 'F', description: 'Fail', minPercentage: 0, maxPercentage: 49, gpa: 0.0, isActive: true, schoolId: null },
      ];
      
      await this.gradeFormatRepository.save(defaultFormats);
    }
  }

  /**
   * Get GPA points from percentage using grading formats
   */
  private async getGpaFromPercentage(percentage: number, schoolId?: string | null): Promise<number> {
    try {
      const formats = await this.resolveGradeFormats(schoolId);
      
      if (formats.length === 0) {
        // Fallback to hardcoded GPA if no formats found
        if (percentage >= 90) return 4.0;
        if (percentage >= 80) return 3.7;
        if (percentage >= 75) return 3.3;
        if (percentage >= 70) return 3.0;
        if (percentage >= 65) return 2.7;
        if (percentage >= 60) return 2.3;
        if (percentage >= 55) return 2.0;
        if (percentage >= 50) return 1.7;
        return 0.0;
      }
      
      const matchingFormat = formats.find(format => 
        percentage >= format.minPercentage && percentage <= format.maxPercentage
      );
      
      return matchingFormat ? Number(matchingFormat.gpa) : 0.0;
    } catch (error) {
      console.error('[ExamResults] Error getting GPA from percentage:', error);
      // Fallback to hardcoded GPA
      if (percentage >= 90) return 4.0;
      if (percentage >= 80) return 3.7;
      if (percentage >= 75) return 3.3;
      if (percentage >= 70) return 3.0;
      if (percentage >= 65) return 2.7;
      if (percentage >= 60) return 2.3;
      if (percentage >= 55) return 2.0;
      if (percentage >= 50) return 1.7;
      return 0.0;
    }
  }

  /**
   * Get remarks from percentage using grading formats
   */
  private async getRemarksFromPercentage(percentage: number, schoolId?: string | null): Promise<string> {
    try {
      const formats = await this.resolveGradeFormats(schoolId);
      
      if (formats.length === 0) {
        // Fallback to hardcoded remarks if no formats found
        if (percentage >= 90) return 'Excellent';
        if (percentage >= 80) return 'Very Good';
        if (percentage >= 70) return 'Good';
        if (percentage >= 60) return 'Satisfactory';
        return 'Needs Improvement';
      }
      
      const matchingFormat = formats.find(format => 
        percentage >= format.minPercentage && percentage <= format.maxPercentage
      );
      
      return matchingFormat ? matchingFormat.description : 'Needs Improvement';
    } catch (error) {
      console.error('[ExamResults] Error getting remarks from percentage:', error);
      // Fallback to hardcoded remarks
      if (percentage >= 90) return 'Excellent';
      if (percentage >= 80) return 'Very Good';
      if (percentage >= 70) return 'Good';
      if (percentage >= 60) return 'Satisfactory';
      return 'Needs Improvement';
    }
  }
}