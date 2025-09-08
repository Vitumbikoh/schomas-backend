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

  async createClass(createClassDto: CreateClassDto, schoolId?: string): Promise<ClassResponseDto> {
    const { name, numericalName, description } = createClassDto;
  
    // Enhanced validation
    if (!name || !name.trim()) {
      throw new BadRequestException('Class name is required');
    }
  
    if (typeof numericalName !== 'number' || numericalName < 0) {
      throw new BadRequestException('Numerical name must be a non-negative number');
    }
  
    // Check for duplicates within the same school (case-insensitive on name)
    const trimmedName = name.trim();
    const qb = this.classRepository
      .createQueryBuilder('class')
      .andWhere('(LOWER(class.name) = LOWER(:name) OR class.numericalName = :numericalName)', {
        name: trimmedName,
        numericalName,
      });

    if (schoolId) {
      qb.andWhere('class.schoolId = :schoolId', { schoolId });
    } else {
      qb.andWhere('class.schoolId IS NULL');
    }

    const existingClass = await qb.getOne();
  
    if (existingClass) {
      throw new BadRequestException('Class name or numerical name already exists');
    }
  
    const newClass = this.classRepository.create({
      name: trimmedName,
      numericalName,
      description: description?.trim(),
      schoolId: schoolId || undefined,
    } as Partial<Class>);
  
  const savedClass = await this.classRepository.save(newClass as Class);
    
    return {
      id: savedClass.id,
      name: savedClass.name,
      numericalName: savedClass.numericalName,
      description: savedClass.description || null,
      createdAt: savedClass.createdAt,
      updatedAt: savedClass.updatedAt,
    };
  }

  async getAllClasses(schoolId?: string, isElevated = false): Promise<ClassResponseDto[]> {
    const qb = this.classRepository.createQueryBuilder('class');
    
    if (!isElevated) {
      if (!schoolId) {
        return []; // Non-elevated users without schoolId gets empty results
      }
      qb.where('class.schoolId = :schoolId', { schoolId });
    } else if (schoolId) {
      // Elevated users (SUPER_ADMIN or ADMIN) can specify schoolId to filter by
      qb.where('class.schoolId = :schoolId', { schoolId });
    }
    // If elevated user and no schoolId specified, return all classes
    
    const classes = await qb.getMany();
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