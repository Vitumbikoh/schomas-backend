import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamResultAggregate } from '../aggregation/entities/exam-result-aggregate.entity';
import { Student } from '../user/entities/student.entity';
import { Class } from '../classes/entity/class.entity';
import { Course } from '../course/entities/course.entity';
import { User } from '../user/entities/user.entity';
import { Term } from '../settings/entities/term.entity';

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
  ) {}

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

    // Calculate GPA (assuming 4.0 scale, only for results with scores)
    const gpaPoints = resultsWithScores.map(result => {
      const percentage = result.finalPercentage;
      if (percentage >= 90) return 4.0;
      if (percentage >= 80) return 3.0;
      if (percentage >= 70) return 2.0;
      if (percentage >= 60) return 1.0;
      return 0.0;
    });

    const overallGPA = gpaPoints.length > 0 
      ? gpaPoints.reduce((sum, gpa) => sum + gpa, 0) / gpaPoints.length 
      : 0;

    // Determine performance remarks
    const getRemarks = (average: number) => {
      if (average >= 80) return 'Very Good';
      if (average >= 70) return 'Good';
      if (average >= 60) return 'Satisfactory';
      if (average >= 50) return 'Needs Improvement';
      return 'Needs Improvement';
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
        remarks: getRemarks(averageScore),
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
    const examResultsForStudentIds = await this.examResultRepository
      .createQueryBuilder('er')
      .leftJoinAndSelect('er.student', 'student')
      .where('student.studentId IN (:...studentIds)', { 
        studentIds: classEntity.students.map(s => s.studentId)
      })
      .andWhere('er.termId = :termId', { termId })
      .getMany();

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
    const studentResults = classEntity.students.map(student => {
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

      // Calculate GPA (only for results with actual scores)
      const gpaPoints = resultsWithScores.map(result => {
        const percentage = parseFloat(result.finalPercentage);
        if (percentage >= 90) return 4.0;
        if (percentage >= 80) return 3.0;
        if (percentage >= 70) return 2.0;
        if (percentage >= 60) return 1.0;
        return 0.0;
      });

      const overallGPA = gpaPoints.length > 0 
        ? gpaPoints.reduce((sum, gpa) => sum + gpa, 0) / gpaPoints.length 
        : 0;

      const getRemarks = (average: number) => {
        if (average >= 80) return 'Very Good';
        if (average >= 70) return 'Good';
        if (average >= 60) return 'Satisfactory';
        if (average >= 50) return 'Needs Improvement';
        return 'Needs Improvement';
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
        remarks: getRemarks(averageScore),
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
    });

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
}