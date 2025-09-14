// src/enrollment/enrollment.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';
import { SettingsService } from 'src/settings/settings.service';

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Return students (same school) not yet enrolled in the given course for the current term.
   */
  async getEligibleStudents(
    courseId: string,
    schoolId?: string,
    superAdmin = false,
    search?: string,
    limit = 50,
  ): Promise<Student[]> {
    const course = await this.courseRepository.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (!superAdmin) {
      if (!schoolId || course.schoolId !== schoolId) {
        throw new NotFoundException('Course not found');
      }
    }

    // Current term (optional filter so we don't consider historical enrollments)
    const Term = await this.settingsService.getCurrentTerm();

    const qb = this.studentRepository
      .createQueryBuilder('student')
      .leftJoin('student.enrollments', 'enrollment', 'enrollment.courseId = :courseId' + (Term ? ' AND enrollment.termId = :ayId' : ''), {
        courseId,
        ayId: Term?.id,
      })
      .leftJoinAndSelect('student.user', 'user');

    if (!superAdmin) {
      qb.where('student.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.where('student.schoolId = :schoolId', { schoolId });
    }

    qb.andWhere('enrollment.id IS NULL');

    if (search) {
      qb.andWhere(
        '(LOWER(student.firstName) LIKE :search OR LOWER(student.lastName) LIKE :search OR LOWER(user.email) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    qb.orderBy('student.lastName', 'ASC').addOrderBy('student.firstName', 'ASC').take(limit);
    return qb.getMany();
  }

  async enrollStudent(
    courseId: string,
    studentId: string,
    schoolId?: string,
    superAdmin = false,
  ): Promise<Enrollment> {
    const [course, student] = await Promise.all([
      this.courseRepository.findOne({ where: { id: courseId } }),
      this.studentRepository.findOne({ where: { id: studentId } }),
    ]);

    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Get current term
    const Term = await this.settingsService.getCurrentTerm();
    if (!Term) {
      throw new NotFoundException('No current term found');
    }

    // Check if already enrolled in this term
    const existingEnrollment = await this.enrollmentRepository.findOne({
      where: {
        courseId,
        studentId,
        termId: Term.id,
      },
    });
    if (existingEnrollment) {
      throw new Error(
        'Student is already enrolled in this course for the current term',
      );
    }

    // Enforce same school unless super admin
    if (!superAdmin) {
      if (!schoolId || course.schoolId !== schoolId || student.schoolId !== schoolId) {
        throw new NotFoundException('Course or student not found');
      }
    }

    const enrollment = this.enrollmentRepository.create({
      course,
      student,
      termId: Term.id,
      enrollmentDate: new Date(),
      status: 'active',
      schoolId: schoolId || undefined,
    });

    // Update course enrollment count
    course.enrollmentCount += 1;
    await this.courseRepository.save(course);

    return this.enrollmentRepository.save(enrollment);
  }

  async unenrollStudent(courseId: string, studentId: string, schoolId?: string, superAdmin = false): Promise<void> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { courseId, studentId },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (!superAdmin && schoolId && enrollment.schoolId && enrollment.schoolId !== schoolId) {
      throw new NotFoundException('Enrollment not found');
    }

    // Update course enrollment count
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
    });
    if (course && course.enrollmentCount > 0) {
      course.enrollmentCount -= 1;
      await this.courseRepository.save(course);
    }

    await this.enrollmentRepository.remove(enrollment);
  }

  async getStudentEnrollments(studentId: string, schoolId?: string, superAdmin = false): Promise<Enrollment[]> {
    const qb = this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .where('enrollment.studentId = :studentId', { studentId });
    if (!superAdmin) {
      qb.andWhere('enrollment.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.andWhere('enrollment.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }

  async getCourseEnrollments(courseId: string, schoolId?: string, superAdmin = false): Promise<Enrollment[]> {
    const qb = this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.student', 'student')
      .where('enrollment.courseId = :courseId', { courseId });
    if (!superAdmin) {
      qb.andWhere('enrollment.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.andWhere('enrollment.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }
  async findAll(schoolId?: string, superAdmin = false): Promise<any[]> {
    const qb = this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.student', 'student')
      .leftJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('course.class', 'courseClass')
      // Removed invalid join 'enrollment.class' (Enrollment entity has no direct class relation)
    if (!superAdmin) {
      qb.where('enrollment.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.where('enrollment.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }

  // Update getAllEnrollments to include term
  async getAllEnrollments(page: number, limit: number, search: string, schoolId?: string, superAdmin = false) {
    const skip = (page - 1) * limit;
    const qb = this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.student', 'student')
      .leftJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('course.class', 'courseClass')
      .leftJoinAndSelect('enrollment.Term', 'Term')
      .orderBy('enrollment.createdAt', 'DESC');
    if (!superAdmin) {
      qb.where('enrollment.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.where('enrollment.schoolId = :schoolId', { schoolId });
    }
    if (search) {
      qb.andWhere(
        '(LOWER(student.firstName) LIKE :search OR LOWER(student.lastName) LIKE :search OR LOWER(course.name) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }
    const [enrollments, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return { enrollments, total };
  }

  async findRecent(limit: number, schoolId?: string, superAdmin = false): Promise<any[]> {
    const qb = this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.student', 'student')
      .leftJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('course.class', 'courseClass')
      // Removed invalid join 'enrollment.class' (Enrollment entity has no class relation)
      .orderBy('enrollment.createdAt', 'DESC')
      .take(limit);
    if (!superAdmin) {
      if (!schoolId) return [];
      qb.where('enrollment.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      qb.where('enrollment.schoolId = :schoolId', { schoolId });
    }
    return qb.getMany();
  }
}
