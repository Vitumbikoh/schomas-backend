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
    // Include both COMPLETE and PENDING results to show progressive calculations
    let query = this.examResultRepository
      .createQueryBuilder('er')
      .leftJoinAndSelect('er.student', 'student')  
      .leftJoinAndSelect('er.course', 'course')
      .leftJoinAndSelect('er.term', 'term')
      .where('er.studentId = :studentId', { studentId })
      .andWhere('er.status IN (:...statuses)', { statuses: ['COMPLETE', 'PENDING'] })
      .andWhere('er.finalPercentage IS NOT NULL'); // Only show results that have been calculated

    // Add filtering conditions
    if (student.schoolId) {
      query = query.andWhere('er.schoolId = :schoolId', { schoolId: student.schoolId });
    }

    if (classId) {
      query = query.andWhere('course."classId" = :classId', { classId });
    }

    if (termId) {
      query = query.andWhere('er.termId = :termId', { termId });
    }

    if (academicCalendarId) {
      query = query.andWhere('term.academicCalendarId = :academicCalendarId', { 
        academicCalendarId 
      });
    }

    const examResults = await query.getMany();

    // Transform results for frontend consumption
    const results = examResults.map(result => ({
      id: result.id,
      courseId: result.courseId,
      courseName: result.course?.name || 'Unknown Course',
      courseCode: result.course?.code || '',
      termId: result.termId,
      termName: result.term ? `Term ${result.term.termNumber}` : 'Unknown Term',
      finalPercentage: parseFloat(result.finalPercentage || '0'),
      finalGradeCode: result.finalGradeCode,
      pass: result.pass,
      breakdown: result.breakdown,
      computedAt: result.computedAt,
      schemeVersion: result.schemeVersion,
    }));

    // Calculate summary statistics
    const validResults = results.filter(r => r.finalPercentage > 0);
    const totalResults = validResults.length;
    const averageScore = totalResults > 0 
      ? validResults.reduce((sum, r) => sum + r.finalPercentage, 0) / totalResults 
      : 0;

    // Calculate GPA (assuming 4.0 scale)
    const gpaPoints = validResults.map(result => {
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
        id: student.id,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        class: student.class,
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

    // Get all exam results for students in this class
    // Include both COMPLETE and PENDING results to show progressive calculations
    let query = this.examResultRepository
      .createQueryBuilder('er')
      .leftJoinAndSelect('er.student', 'student')
      .leftJoinAndSelect('er.course', 'course')
      .leftJoinAndSelect('er.term', 'term')
      .where('student.id IN (:...studentIds)', { 
        studentIds: classEntity.students.map(s => s.id)
      })
      .andWhere('er.status IN (:...statuses)', { statuses: ['COMPLETE', 'PENDING'] })
      .andWhere('er.finalPercentage IS NOT NULL'); // Only show results that have been calculated

    // Add filtering conditions
    if (schoolId) {
      query = query.andWhere('er.schoolId = :schoolId', { schoolId });
    }

    if (classId) {
      query = query.andWhere('course."classId" = :classId', { classId });
    }

    if (termId) {
      query = query.andWhere('er.termId = :termId', { termId });
    }

    if (academicCalendarId) {
      query = query.andWhere('term.academicCalendarId = :academicCalendarId', { 
        academicCalendarId 
      });
    }

    const examResults = await query.getMany();

    // Group results by student
    const resultsByStudent = new Map<string, any[]>();
    examResults.forEach(result => {
      const studentId = result.student.studentId;
      if (!resultsByStudent.has(studentId)) {
        resultsByStudent.set(studentId, []);
      }
      const studentResults = resultsByStudent.get(studentId);
      if (studentResults) {
        studentResults.push(result);
      }
    });

    // Process each student's results
    const studentResults = classEntity.students.map(student => {
      const studentExamResults = resultsByStudent.get(student.studentId) || [];
      
      // Calculate student's aggregated statistics
      const validResults = studentExamResults.filter(r => 
        r.finalPercentage && parseFloat(r.finalPercentage) > 0
      );
      
      const totalResults = validResults.length;
      const averageScore = totalResults > 0 
        ? validResults.reduce((sum, r) => sum + parseFloat(r.finalPercentage || '0'), 0) / totalResults 
        : 0;

      // Calculate GPA
      const gpaPoints = validResults.map(result => {
        const percentage = parseFloat(result.finalPercentage || '0');
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
        results: studentExamResults.map(result => ({
          courseId: result.courseId,
          courseName: result.course?.name || 'Unknown Course',
          courseCode: result.course?.code || '',
          finalPercentage: parseFloat(result.finalPercentage || '0'),
          finalGradeCode: result.finalGradeCode,
          pass: result.pass,
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
}