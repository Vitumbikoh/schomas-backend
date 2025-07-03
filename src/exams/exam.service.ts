import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExamDto } from './dto/create-exam.dto';
import { Exam } from './entities/exam.entity';
import { Class } from '../classes/entity/class.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Course } from '../course/entities/course.entity';
import { User } from '../user/entities/user.entity';

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(Exam)
    private examRepository: Repository<Exam>,
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<Exam[]> {
    return this.examRepository.find({
      relations: ['class', 'teacher', 'course'],
    });
  }

  async create(createExamDto: CreateExamDto): Promise<Exam> {
    const { classId, teacherId, courseId, ...examData } = createExamDto;

    const classEntity = await this.classRepository.findOne({ 
      where: { id: classId }
    });
    if (!classEntity) {
      throw new NotFoundException(`Class with ID ${classId} not found`);
    }

    const teacher = await this.teacherRepository.findOne({ 
      where: { userId: teacherId },
      relations: ['user'],
    });
    if (!teacher) {
      throw new NotFoundException(`Teacher with userId ${teacherId} not found`);
    }

    const course = await this.courseRepository.findOne({ 
      where: { id: courseId }
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const exam = this.examRepository.create({
      ...examData,
      class: classEntity,
      teacher: teacher,
      course: course,
    });

    return this.examRepository.save(exam);
  }

  async findByFilters(
    searchTerm?: string,
    className?: string,
    teacherId?: string,
    teacherName?: string,
    academicYear?: string,
  ): Promise<Exam[]> {
    const query = this.examRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.class', 'class')
      .leftJoinAndSelect('exam.teacher', 'teacher')
      .leftJoinAndSelect('teacher.user', 'user')
      .leftJoinAndSelect('exam.course', 'course');

    if (searchTerm) {
      query.where(
        '(exam.title ILIKE :searchTerm OR exam.subject ILIKE :searchTerm OR course.name ILIKE :searchTerm)',
        { searchTerm: `%${searchTerm}%` },
      );
    }

    if (className && className !== 'All Classes') {
      query.andWhere('class.name = :className', { className });
    }

    if (teacherId && teacherId !== 'All Teachers') {
      query.andWhere('teacher.userId = :teacherId', { teacherId });
    } else if (teacherName && teacherName !== 'All Teachers') {
      const [firstName, lastName] = teacherName.split(' ');
      query.andWhere(
        '(teacher.firstName = :firstName AND teacher.lastName = :lastName)',
        { firstName, lastName },
      );
    }

    if (academicYear && academicYear !== 'All Years') {
      const [startYear, endYear] = academicYear.split('-');
      const startDate = new Date(`${startYear}-09-01`);
      const endDate = new Date(`${endYear}-08-31`);
      
      query.andWhere('exam.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    return query.getMany();
  }

  async getExamStatistics(): Promise<{
    totalExams: number;
    administeredExams: number;
    gradedExams: number;
    upcomingExams: number;
  }> {
    const [totalExams, administeredExams, gradedExams, upcomingExams] = await Promise.all([
      this.examRepository.count(),
      this.examRepository.count({ where: { status: 'administered' } }),
      this.examRepository.count({ where: { status: 'graded' } }),
      this.examRepository.count({ where: { status: 'upcoming' } }),
    ]);

    return {
      totalExams,
      administeredExams,
      gradedExams,
      upcomingExams,
    };
  }

  async getDistinctAcademicYears(): Promise<string[]> {
    const exams = await this.examRepository.find({
      select: ['date'],
      order: { date: 'ASC' },
    });

    const years = new Set<string>();
    exams.forEach((exam) => {
      const dateObj = new Date(exam.date);
      const year = dateObj.getFullYear();
      years.add(`${year}-${year + 1}`);
    });

    return ['All Years', ...Array.from(years).sort()];
  }

    async findOne(id: string): Promise<Exam> {
    const exam = await this.examRepository.findOne({
      where: { id },
      relations: ['class', 'teacher', 'course'],
    });
    if (!exam) {
      throw new NotFoundException(`Exam with ID ${id} not found`);
    }
    return exam;
  }
}