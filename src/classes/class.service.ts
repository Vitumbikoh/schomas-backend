import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Class } from './entity/class.entity';
import { ClassResponseDto, CreateClassDto } from './dtos/class.dto';

@Injectable()
export class ClassService {
  constructor(
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
  ) {}

  async createClass(createClassDto: CreateClassDto): Promise<ClassResponseDto> {
    const { name, numericalName, description } = createClassDto;
  
    // Enhanced validation
    if (!name || !name.trim()) {
      throw new BadRequestException('Class name is required');
    }
  
    if (typeof numericalName !== 'number' || numericalName < 0) {
      throw new BadRequestException('Numerical name must be a non-negative number');
    }
  
    // Check for duplicates (case-insensitive)
    const existingClass = await this.classRepository
      .createQueryBuilder('class')
      .where('LOWER(class.name) = LOWER(:name)', { name })
      .orWhere('class.numericalName = :numericalName', { numericalName })
      .getOne();
  
    if (existingClass) {
      throw new BadRequestException('Class name or numerical name already exists');
    }
  
    const newClass = this.classRepository.create({
      name: name.trim(),
      numericalName,
      description: description?.trim(),
    });
  
    const savedClass = await this.classRepository.save(newClass);
    
    return {
      id: savedClass.id,
      name: savedClass.name,
      numericalName: savedClass.numericalName,
      description: savedClass.description || null,
      createdAt: savedClass.createdAt,
      updatedAt: savedClass.updatedAt,
    };
  }

  async getAllClasses(): Promise<ClassResponseDto[]> {
    const classes = await this.classRepository.find();
    return classes.map(classItem => ({
      id: classItem.id,
      name: classItem.name,
      numericalName: classItem.numericalName,
      description: classItem.description || null,
      createdAt: classItem.createdAt,
      updatedAt: classItem.updatedAt
    }));
  }
  
}