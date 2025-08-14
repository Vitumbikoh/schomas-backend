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

@Injectable()
export class GradeService {
  constructor(
    @InjectRepository(Grade)
    private gradeRepository: Repository<Grade>,
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
      'midterm',
      'endterm',
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

      gradeRecords.push(gradeRecord);
    }

    // Save to database
    return this.gradeRepository.save(gradeRecords);
  }

  async getAllClasses(): Promise<Class[]> {
    return this.classRepository.find({
      relations: ['students'],
    });
  }

  async getClassStudents(
    classId: string,
    userId: string,
    academicYear?: string,
    term?: string,
  ): Promise<Student[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
      relations: ['students', 'students.user'],
    });

    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    return classEntity.students;
  }

  async getClassGrades(
    classId: string,
    userId: string,
    academicYear?: string,
    term?: string,
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

    if (academicYear) {
      query.andWhere('EXTRACT(YEAR FROM grade.date) = :year', {
        year: academicYear.split('-')[0],
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
        grade: this.calculateLetterGrade(marks),
        date: grade.date,
        examType: grade.assessmentType,
      });

      studentResult.totalMarks += marks;
      studentResult.totalPossible += 100;
    });

    const results = Array.from(studentResultsMap.values()).map(
      (studentResult) => {
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

        return {
          ...studentResult,
          totalMarks,
          totalPossible,
          averageScore,
          overallGPA: this.calculateGPA(studentResult.results),
          totalExams: studentResult.results.length,
          remarks: this.getRemarks(averageScore),
        };
      },
    );

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
    academicYear?: string,
    term?: string,
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
      .where('grade.student = :studentId', { studentId: student.id });

    if (classId) {
      query.andWhere('grade.classId = :classId', { classId });
    }
    if (academicYear) {
      query.andWhere('EXTRACT(YEAR FROM grade.date) = :year', {
        year: academicYear.split('-')[0],
      });
    }

    const grades = await query.getMany();

    const results = grades.map((grade) => ({
      gradeId: grade.gradeId,
      examTitle: grade.course.name,
      subject: grade.course.name,
      marksObtained: parseFloat(grade.grade) || 0,
      totalMarks: 100,
      percentage: parseFloat(grade.grade) || 0,
      grade: this.calculateLetterGrade(parseFloat(grade.grade) || 0),
      date: grade.date,
      examType: grade.assessmentType,
    }));

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
      },
      results,
      overallGPA: this.calculateGPA(results),
      totalExams: results.length,
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

    // Get all grades for this student
    const grades = await this.gradeRepository.find({
      where: { student: { id: student.id } },
      relations: ['course', 'class'],
    });

    const results = grades.map((grade) => ({
      gradeId: grade.gradeId,
      examTitle: grade.course.name,
      subject: grade.course.name,
      marksObtained: parseFloat(grade.grade) || 0,
      totalMarks: 100,
      percentage: parseFloat(grade.grade) || 0,
      grade: this.calculateLetterGrade(parseFloat(grade.grade) || 0),
      date: grade.date,
      examType: grade.assessmentType,
    }));

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
      },
      results,
      overallGPA: this.calculateGPA(results),
      totalExams: results.length,
    };
  }

  private getRemarks(averageScore: number): string {
    if (averageScore >= 90) return 'Excellent';
    if (averageScore >= 80) return 'Very Good';
    if (averageScore >= 70) return 'Good';
    if (averageScore >= 60) return 'Satisfactory';
    return 'Needs Improvement';
  }

  private calculateLetterGrade(percentage: number): string {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  }

  private calculateGPA(grades: any[]): number {
    if (grades.length === 0) return 0;
    const total = grades.reduce((sum, grade) => {
      const percentage = grade.percentage || 0;
      if (percentage >= 90) return sum + 4;
      if (percentage >= 80) return sum + 3;
      if (percentage >= 70) return sum + 2;
      if (percentage >= 60) return sum + 1;
      return sum;
    }, 0);
    return total / grades.length;
  }
}