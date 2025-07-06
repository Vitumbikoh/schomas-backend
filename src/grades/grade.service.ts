import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateGradeDto } from './dtos/grade.dto';
import { User } from '../user/entities/user.entity';
import { Course } from '../course/entities/course.entity';
import { Class } from '../classes/entity/class.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Role } from '../user/enums/role.enum';
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
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
    if (!grades || typeof grades !== 'object' || Object.keys(grades).length === 0) {
      throw new BadRequestException('No valid grades provided');
    }

    // Fetch user with TEACHER role
    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.TEACHER },
    });
    if (!user) {
      console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
      throw new UnauthorizedException('User is not a teacher or does not exist');
    }

    // Fetch teacher by userId
    const teacher = await this.teacherRepository.findOne({
      where: { userId: userId },
    });
    if (!teacher) {
      console.log(`No Teacher found for userId: ${userId}`);
      throw new UnauthorizedException('No Teacher profile associated with this user');
    }
    console.log(`Found teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.id})`);

    // Fetch class
    const classEntity = await this.classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      throw new BadRequestException('Invalid class');
    }

    // Fetch course and verify teacher association
    const course = await this.courseRepository.findOne({
      where: { id: courseId, teacher: { id: teacher.id } },
      relations: ['teacher'],
    });
    if (!course) {
      console.log(`Course ${courseId} not found or not assigned to teacher ${teacher.id}`);
      throw new BadRequestException('Invalid course or teacher not assigned');
    }

    // Validate assessment type
    const validAssessmentTypes = ['midterm', 'endterm', 'quiz', 'assignment', 'practical'];
    if (!validAssessmentTypes.includes(assessmentType)) {
      throw new BadRequestException('Invalid assessment type');
    }

    // Create grade records
    const gradeRecords: Grade[] = [];
    for (const [studentId, gradeValue] of Object.entries(grades)) {
      // Fetch Student entity by studentId (not UUID)
      const student = await this.studentRepository.findOne({
        where: { studentId },
        relations: ['user'],
      });
      if (!student) {
        console.log(`No Student entity found for studentId: ${studentId}`);
        throw new BadRequestException(`Invalid student ID: ${studentId}`);
      }

      // Verify student is enrolled in the course
      const isEnrolled = await this.studentRepository
        .createQueryBuilder('student')
        .innerJoin('student.courses', 'course', 'course.id = :courseId', { courseId })
        .where('student.id = :studentId', { studentId: student.id })
        .getCount() > 0;

      if (!isEnrolled) {
        console.log(`Student ${studentId} is not enrolled in course ${courseId}`);
        throw new BadRequestException(`Student ${studentId} is not enrolled in this course`);
      }

      console.log(`Found student: ${student.firstName} ${student.lastName} (${student.id})`);

      const gradeRecord = new Grade();
      gradeRecord.student = student.user;
      gradeRecord.teacher = user;
      gradeRecord.course = course;
      gradeRecord.class = classEntity;
      gradeRecord.assessmentType = assessmentType;
      gradeRecord.grade = String(gradeValue); // Convert to string here
      gradeRecord.studentId = studentId;
      gradeRecord.date = new Date();

      gradeRecords.push(gradeRecord);
    }

    // Save to database
    return this.gradeRepository.save(gradeRecords);
  }
}