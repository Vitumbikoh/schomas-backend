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

  async enrollStudent(
    courseId: string,
    studentId: string,
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

    // Get current academic year
    const academicYear = await this.settingsService.getCurrentAcademicYear();
    if (!academicYear) {
      throw new NotFoundException('No current academic year found');
    }

    // Check if already enrolled in this academic year
    const existingEnrollment = await this.enrollmentRepository.findOne({
      where: {
        courseId,
        studentId,
        academicYearId: academicYear.id,
      },
    });
    if (existingEnrollment) {
      throw new Error(
        'Student is already enrolled in this course for the current academic year',
      );
    }

    const enrollment = this.enrollmentRepository.create({
      course,
      student,
      academicYearId: academicYear.id, // Add academic year
      enrollmentDate: new Date(),
      status: 'active',
    });

    // Update course enrollment count
    course.enrollmentCount += 1;
    await this.courseRepository.save(course);

    return this.enrollmentRepository.save(enrollment);
  }

  async unenrollStudent(courseId: string, studentId: string): Promise<void> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { courseId, studentId },
    });

    if (!enrollment) {
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

  async getStudentEnrollments(studentId: string): Promise<Enrollment[]> {
    return this.enrollmentRepository.find({
      where: { studentId },
      relations: ['course', 'course.teacher'],
    });
  }

  async getCourseEnrollments(courseId: string): Promise<Enrollment[]> {
    return this.enrollmentRepository.find({
      where: { courseId },
      relations: ['student'],
    });
  }
  async findAll(): Promise<any[]> {
    return this.enrollmentRepository.find({ relations: ['student', 'course'] });
  }

  // Update getAllEnrollments to include academic year
  async getAllEnrollments(page: number, limit: number, search: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? [
          { student: { firstName: Like(`%${search}%`) } },
          { student: { lastName: Like(`%${search}%`) } },
          { course: { name: Like(`%${search}%`) } },
        ]
      : {};

    const [enrollments, total] = await this.enrollmentRepository.findAndCount({
      where,
      relations: ['student', 'course', 'academicYear'],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { enrollments, total };
  }

  async findRecent(limit: number): Promise<any[]> {
    return this.enrollmentRepository.find({
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['student', 'course'],
    });
  }
}
