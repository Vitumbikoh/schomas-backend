import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    console.log('Received DTO:', createGradeDto);

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
      console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
      throw new UnauthorizedException(
        'User is not a teacher or does not exist',
      );
    }

    // Fetch teacher by userId
    const teacher = await this.teacherRepository.findOne({
      where: { userId: userId },
    });
    if (!teacher) {
      console.log(`No Teacher found for userId: ${userId}`);
      throw new UnauthorizedException(
        'No Teacher profile associated with this user',
      );
    }
    console.log(
      `Found teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.id})`,
    );

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
      console.log(
        `Course ${courseId} not found or not assigned to teacher ${teacher.id}`,
      );
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
    console.log(
      `Enrolled student IDs in course ${courseId}:`,
      enrolledStudentIds,
    );

    // Create grade records
    const gradeRecords: Grade[] = [];
    for (const [studentId, gradeValue] of Object.entries(grades)) {
      // Check if student is enrolled in course
      if (!enrolledStudentIds.includes(studentId)) {
        console.log(
          `Student ${studentId} is not enrolled in course ${courseId}`,
        );
        throw new BadRequestException(
          `Student ${studentId} is not enrolled in this course`,
        );
      }

      // Fetch Student entity by studentId (not UUID)
      const student = await this.studentRepository.findOne({
        where: { studentId },
        relations: ['user'],
      });
      if (!student) {
        console.log(`No Student entity found for studentId: ${studentId}`);
        throw new BadRequestException(`Invalid student ID: ${studentId}`);
      }

      console.log(
        `Found student: ${student.firstName} ${student.lastName} (${student.id})`,
      );

      const gradeRecord = new Grade();
      gradeRecord.student = student.user;
      gradeRecord.teacher = user;
      gradeRecord.course = course;
      gradeRecord.class = classEntity;
      gradeRecord.assessmentType = assessmentType;
      gradeRecord.grade = String(gradeValue);
      gradeRecord.studentId = studentId;
      gradeRecord.date = new Date();

      gradeRecords.push(gradeRecord);
    }

    // Save to database
    return this.gradeRepository.save(gradeRecords);
  }

  async getStudentGrades(
    userId: string,
  ): Promise<{ success: boolean; grades: any[] }> {
    // Find the student by userId
    const student = await this.studentRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!student) {
      throw new UnauthorizedException('Student not found');
    }

    // Debug: Check student details
    console.log(`Student found: ${student.firstName} ${student.lastName}, Student ID: ${student.id}, User ID: ${student.user.id}`);

    // Fetch grades directly using the student's ID (which matches grade.studentId)
    const grades = await this.gradeRepository.find({
      where: { studentId: student.id }, // Explicitly match grade.studentId with Student.id
      relations: ['course'],
    });
    console.log(`Fetched grades count: ${grades.length}, Student ID used: ${student.id}`);

    // If no grades found, try matching by userId as a fallback (though less likely)
    if (grades.length === 0) {
      console.log(`No grades found for Student ID ${student.id}. Trying User ID ${student.user.id}...`);
      const fallbackGrades = await this.gradeRepository.find({
        where: { studentId: student.user.id }, // Fallback to userId if needed
        relations: ['course'],
      });
      console.log(`Fallback grades count: ${fallbackGrades.length}`);
      if (fallbackGrades.length > 0) {
        grades.push(...fallbackGrades);
      }
    }

    // Transform grades
    const transformedGrades = grades.map((grade) => ({
      course: grade.course.name,
      grade: grade.grade,
      assessmentType: grade.assessmentType,
    }));
    console.log('Transformed grades:', transformedGrades);

    return { success: true, grades: transformedGrades };
  }
}