import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExamDto } from './dto/create-exam.dto';
import { Exam } from './entities/exam.entity';

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(Exam)
    private examRepository: Repository<Exam>,
  ) {}

  async findAll(): Promise<Exam[]> {
    return this.examRepository.find();
  }

  async findByFilters(
    searchTerm?: string,
    className?: string,
    teacher?: string,
    academicYear?: string,
  ): Promise<Exam[]> {
    const query = this.examRepository.createQueryBuilder('exam');

    if (searchTerm) {
      query.where('exam.title ILIKE :searchTerm OR exam.subject ILIKE :searchTerm', {
        searchTerm: `%${searchTerm}%`,
      });
    }

    if (className && className !== 'All Classes') {
      query.andWhere('exam.class = :className', { className });
    }

    if (teacher && teacher !== 'All Teachers') {
      query.andWhere('exam.teacher = :teacher', { teacher });
    }

    if (academicYear && academicYear !== 'All Years') {
      query.andWhere('exam.academicYear = :academicYear', { academicYear });
    }

    return query.getMany();
  }

  async create(createExamDto: CreateExamDto): Promise<Exam> {
    const exam = this.examRepository.create(createExamDto);
    return this.examRepository.save(exam);
  }
}