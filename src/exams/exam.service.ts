// src/exam/exam.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExamDto } from './dto/create-exam.dto';
import { Exam } from './entities/exam.entity';
import { Class } from '../classes/entity/class.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Course } from '../course/entities/course.entity';
import { User } from '../user/entities/user.entity';
import { SettingsService } from '../settings/settings.service'; // Add this import
import { AcademicYear } from 'src/settings/entities/academic-year.entity';

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
    @InjectRepository(AcademicYear) // Add this injection
    private academicYearRepository: Repository<AcademicYear>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private settingsService: SettingsService, // Add this
  ) {}

  async findAll(): Promise<Exam[]> {
    return this.examRepository.find({
      relations: ['class', 'teacher', 'course', 'academicYear'], // Include academicYear
    });
  }

  async create(createExamDto: CreateExamDto): Promise<Exam> {
    const { classId, teacherId, courseId, ...examData } = createExamDto;

    // Get current academic year automatically
    const academicYear = await this.settingsService.getCurrentAcademicYear();
    if (!academicYear) {
      throw new NotFoundException('No current academic year found');
    }

    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
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
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const exam = this.examRepository.create({
      ...examData,
      class: classEntity,
      teacher: teacher,
      course: course,
      academicYearId: academicYear.id, // Set automatically
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
      .leftJoinAndSelect('exam.course', 'course')
      .leftJoinAndSelect('exam.academicYear', 'academicYear'); // Include academicYear

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
      // Update to filter by academicYear.id if you have the ID
      // Or keep the date range filter if you prefer
      query.andWhere('academicYear.id = :academicYearId', {
        academicYearId: academicYear,
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
    // Get current academic year
    const academicYear = await this.settingsService.getCurrentAcademicYear();

    const where = academicYear ? { academicYearId: academicYear.id } : {};

    const [totalExams, administeredExams, gradedExams, upcomingExams] =
      await Promise.all([
        this.examRepository.count({ where }),
        this.examRepository.count({
          where: { ...where, status: 'administered' },
        }),
        this.examRepository.count({ where: { ...where, status: 'graded' } }),
        this.examRepository.count({ where: { ...where, status: 'upcoming' } }),
      ]);

    return {
      totalExams,
      administeredExams,
      gradedExams,
      upcomingExams,
    };
  }

// src/exam/exam.service.ts
async getExamCountByCourse(courseIds: string[]): Promise<Map<string, number>> {
  if (!courseIds || courseIds.length === 0) {
    console.log('No course IDs provided for exam count query');
    return new Map<string, number>();
  }

  console.log('Querying exam counts for course IDs:', courseIds);

  const examCounts = await this.examRepository.query(`
    SELECT "courseId", COUNT(id) AS "examCount"
    FROM exam
    WHERE "courseId" IN (:...courseIds)
    GROUP BY "courseId"
  `, [courseIds]);

  console.log('Raw exam counts:', examCounts);

  const examCountMap = new Map<string, number>();
  examCounts.forEach((ec: any) => {
    examCountMap.set(ec.courseId, parseInt(ec.examCount));
  });

  courseIds.forEach((courseId) => {
    if (!examCountMap.has(courseId)) {
      examCountMap.set(courseId, 0);
    }
  });

  console.log('Exam count map:', Array.from(examCountMap.entries()));
  return examCountMap;
}

  async getDistinctAcademicYears(): Promise<string[]> {
    // Get all academic years with their calendar relations
    const academicYears = await this.academicYearRepository.find({
      relations: ['academicCalendar'],
      order: { startDate: 'ASC' },
    });

    // Extract unique academic years from the calendar
    const years = new Set<string>();
    academicYears.forEach((ay) => {
      if (ay.academicCalendar?.academicYear) {
        years.add(ay.academicCalendar.academicYear);
      }
    });

    return ['All Years', ...Array.from(years)];
  }

  async findOne(id: string): Promise<Exam> {
    const exam = await this.examRepository.findOne({
      where: { id },
      relations: ['class', 'teacher', 'course', 'academicYear'], // Include academicYear
    });
    if (!exam) {
      throw new NotFoundException(`Exam with ID ${id} not found`);
    }
    return exam;
  }

  async findByCourseAndTeacher(courseId: string, teacherId: string): Promise<Exam[]> {
  return this.examRepository.find({
    where: {
      course: { id: courseId },
      teacher: { id: teacherId },
    },
    relations: ['course', 'teacher'],
  });
}
}
