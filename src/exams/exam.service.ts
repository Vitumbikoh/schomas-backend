// src/exam/exam.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exam } from './entities/exam.entity';
import { Question } from './entities/question.entity';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { CourseService } from '../course/course.service';
import { TeachersService } from '../teacher/teacher.service';
import { ExamAttempt } from './entities/exam-attempt.entity';

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(Exam)
    private readonly examRepository: Repository<Exam>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(ExamAttempt) // This must match the entity in TypeOrmModule.forFeature()
    private readonly examAttemptRepository: Repository<ExamAttempt>,
    private readonly courseService: CourseService,
    private readonly teacherService: TeachersService,
  ) {}

  async create(createExamDto: CreateExamDto, teacherId: string): Promise<Exam> {
    const course = await this.courseService.findOne(createExamDto.courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const teacher = await this.teacherService.findOneById(teacherId);
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const exam = this.examRepository.create({
      ...createExamDto,
      course,
      teacher,
    });

    const savedExam = await this.examRepository.save(exam);

    // Create questions
    const questions = createExamDto.questions.map((questionDto) =>
      this.questionRepository.create({
        ...questionDto,
        exam: savedExam,
      }),
    );

    await this.questionRepository.save(questions);
    savedExam.questions = questions;

    return savedExam;
  }

  async findAllByCourse(courseId: string): Promise<Exam[]> {
    return this.examRepository.find({
      where: { courseId },
      relations: ['questions', 'teacher'],
    });
  }

  async findOne(id: string): Promise<Exam> {
    const exam = await this.examRepository.findOne({
      where: { id },
      relations: ['questions', 'course', 'teacher'],
    });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    return exam;
  }

  async update(id: string, updateExamDto: UpdateExamDto): Promise<Exam> {
    const exam = await this.findOne(id);
    Object.assign(exam, updateExamDto);
    return this.examRepository.save(exam);
  }

  async remove(id: string): Promise<void> {
    const exam = await this.findOne(id);
    await this.examRepository.remove(exam);
  }

  async findExamsByTeacher(teacherId: string): Promise<Exam[]> {
    return this.examRepository.find({
      where: { teacherId },
      relations: ['course', 'questions'],
    });
  }

  async isTeacherAssignedToCourse(
    teacherId: string,
    courseId: string,
  ): Promise<boolean> {
    const course = await this.courseService.findOne(courseId);
    return course.teacherId === teacherId;
  }

  async getAdminDashboardData() {
    const [upcomingExams, recentGrades] = await Promise.all([
      this.examRepository.find({
        where: { status: 'upcoming' },
        relations: ['course', 'teacher'],
        take: 5,
        order: { startTime: 'ASC' },
      }),
      this.getRecentGrades(10),
    ]);

    const stats = await this.getExamStats();

    return {
      upcomingExams,
      recentGrades,
      stats,
    };
  }

  async getTeacherDashboardData(teacherId: string) {
    const [upcomingExams, recentGrades] = await Promise.all([
      this.examRepository.find({
        where: { teacherId, status: 'upcoming' },
        relations: ['course'],
        take: 5,
        order: { startTime: 'ASC' },
      }),
      this.getRecentGrades(10, teacherId),
    ]);

    const stats = await this.getExamStats(teacherId);

    return {
      upcomingExams,
      recentGrades,
      stats,
    };
  }

  private async getExamStats(teacherId?: string) {
    const query = this.examRepository.createQueryBuilder('exam');

    if (teacherId) {
      query.where('exam.teacherId = :teacherId', { teacherId });
    }

    const [totalExams, publishedExams] = await Promise.all([
      query.getCount(),
      teacherId 
        ? this.examRepository.count({ where: { teacherId, status: 'published' } })
        : this.examRepository.count({ where: { status: 'published' } }),
    ]);

    // Add more stats as needed
    return {
      totalExams,
      publishedExams,
      // Add other stats
    };
  }
  private async getRecentGrades(limit: number, teacherId?: string) {
    try {
      // Get exam IDs first
      const examQuery = this.examRepository.createQueryBuilder('exam');
      if (teacherId) {
        examQuery.where('exam.teacherId = :teacherId', { teacherId });
      }
      
      const exams = await examQuery.getMany();
      const examIds = exams.map(exam => exam.id);
  
      if (examIds.length === 0) {
        return [];
      }
  
      // Get recent attempts with student data
      const attempts = await this.examAttemptRepository
        .createQueryBuilder('attempt')
        .leftJoinAndSelect('attempt.student', 'student')
        .leftJoinAndSelect('attempt.exam', 'exam')
        .leftJoinAndSelect('exam.course', 'course')
        .where('attempt.examId IN (:...examIds)', { examIds })
        .orderBy('attempt.submittedAt', 'DESC')
        .take(limit)
        .getMany();
  
      // Transform the data
      return attempts.map(attempt => ({
        id: attempt.id,
        studentId: attempt.student.id,
        studentName: `${attempt.student.firstName} ${attempt.student.lastName}`,
        examTitle: attempt.exam.title,
        courseName: attempt.exam.course?.name || 'N/A',
        score: attempt.score || 0,
        totalMarks: attempt.exam.totalMarks,
        percentage: attempt.score ? Math.round((attempt.score / attempt.exam.totalMarks) * 100) : 0,
        passed: attempt.score >= attempt.exam.passingMarks,
        submittedAt: attempt.submittedAt,
      }));
    } catch (error) {
      console.error('Error fetching recent grades:', error);
      return [];
    }
  }

}
 