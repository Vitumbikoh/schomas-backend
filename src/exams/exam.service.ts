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

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(Exam)
    private readonly examRepository: Repository<Exam>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
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
}