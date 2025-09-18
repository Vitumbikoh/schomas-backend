// src/course/course.service.ts
import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Like, Repository, In } from 'typeorm';
import { Course } from './entities/course.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { BulkCreateCourseDto } from './dto/bulk-create-course.dto';
import { Teacher } from 'src/user/entities/teacher.entity';
import { Student } from 'src/user/entities/student.entity';
import { Class } from 'src/classes/entity/class.entity';
import * as XLSX from 'xlsx';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);
  
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,

    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
  ) {}

  async findAll(
    options: {
      skip?: number;
      take?: number;
      where?: FindOptionsWhere<Course> | FindOptionsWhere<Course>[];
      relations?: string[];
      schoolId?: string;
      superAdmin?: boolean;
    } = {},
  ): Promise<Course[]> {
    const qb = this.courseRepository.createQueryBuilder('course')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .leftJoinAndSelect('course.class', 'class');

    if (options.schoolId && !options.superAdmin) {
      qb.andWhere('course.schoolId = :schoolId', { schoolId: options.schoolId });
    }

    if (options.where) {
      // Basic handling for simple LIKE searches already prepared outside
      // Complex OR conditions can be appended by caller via custom methods
    }

    if (options.skip) qb.skip(options.skip);
    if (options.take) qb.take(options.take);
    qb.orderBy('course.createdAt', 'DESC');
    return qb.getMany();
  }

  async count(
    where?: FindOptionsWhere<Course> | FindOptionsWhere<Course>[],
    schoolId?: string,
    superAdmin = false,
  ): Promise<number> {
    let combinedWhere = where || {};
    
    // Apply school filtering
    if (!superAdmin) {
      if (!schoolId) return 0;
      if (Array.isArray(combinedWhere)) {
        combinedWhere = combinedWhere.map(w => ({ ...w, schoolId }));
      } else {
        combinedWhere = { ...combinedWhere, schoolId };
      }
    } else if (schoolId) {
      if (Array.isArray(combinedWhere)) {
        combinedWhere = combinedWhere.map(w => ({ ...w, schoolId }));
      } else {
        combinedWhere = { ...combinedWhere, schoolId };
      }
    }
    
    return await this.courseRepository.count({ where: combinedWhere });
  }

  async findOne(
    id: string,
    relations: string[] = ['teacher', 'class'],
  ): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id },
      relations,
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${id} not found`);
    }
    return course;
  }


  async findStudentsByClass(classId: string): Promise<Student[]> {
    const classEntity = await this.classRepository.findOne({
      where: { id: classId },
      relations: ['students', 'students.user'], // Load students and their user relation
    });

    if (!classEntity) {
      throw new NotFoundException(`Class with ID ${classId} not found`);
    }

    return classEntity.students || [];
  }
  
  async create(createCourseDto: CreateCourseDto, schoolId?: string, superAdmin = false): Promise<Course> {
    const course = new Course();
    Object.assign(course, createCourseDto);
    if (schoolId) course.schoolId = schoolId;

    if (createCourseDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({
        where: { id: createCourseDto.teacherId },
      });

      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }
      // Ensure teacher is in same school unless super admin
      if (!superAdmin && schoolId && teacher.schoolId && teacher.schoolId !== schoolId) {
        throw new NotFoundException('Teacher not found');
      }
      course.teacher = teacher;
    }

  return this.courseRepository.save(course); // This will generate a UUID
  }

  async update(id: string, updateCourseDto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id, ['teacher']);

    if (updateCourseDto.teacherId) {
      const teacher = await this.teacherRepository.findOne({
        where: { id: updateCourseDto.teacherId },
      });

      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }
      course.teacher = teacher;
      delete updateCourseDto.teacherId;
    }

    this.courseRepository.merge(course, updateCourseDto);
    return this.courseRepository.save(course);
  }

  async remove(id: string): Promise<void> {
    const course = await this.findOne(id);
    await this.courseRepository.remove(course);
  }

  async assignTeacher(courseId: string, teacherId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['teacher'], // Include teacher in the query
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    course.teacher = teacher;
    course.teacherId = teacher.id; // Explicitly set the teacherId

    await this.courseRepository.save(course);

    // Reload the course to ensure all relations are properly loaded
    const updatedCourse = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['teacher', 'teacher.user'],
    });

    if (!updatedCourse) {
      throw new NotFoundException('Course not found after assigning teacher');
    }

    return updatedCourse;
  }

  async searchCourses(query: string): Promise<Course[]> {
    return await this.courseRepository.find({
      where: [
        { name: Like(`%${query}%`) },
        { code: Like(`%${query}%`) },
        { description: Like(`%${query}%`) },
      ],
      relations: ['teacher'],
      take: 10,
    });
  }

  async findActiveCourses(): Promise<Course[]> {
    return await this.courseRepository.find({
      where: { status: 'active' },
      relations: ['teacher'],
      order: { name: 'ASC' },
    });
  }

  async findByClass(classId: string): Promise<Teacher[]> {
    const courses = await this.courseRepository.find({
      where: { class: { id: classId } },
      relations: ['teacher'],
    });
    const teachers = courses
      .map(course => course.teacher)
      .filter((teacher, index, self) => teacher && self.findIndex(t => t.id === teacher.id) === index);
    if (teachers.length === 0) {
      return [];
    }
    // Optionally, load 'user' relation for each teacher
    return this.teacherRepository.find({
      where: { id: In(teachers.map(t => t.id)) },
      relations: ['user'],
    });
  }

  async getCourseEnrollments(courseId: string): Promise<any[]> {
    // Adjust the relation names and entity as per your actual model
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['enrollments', 'enrollments.student'],
    });
    if (!course) {
      return [];
    }
    return course.enrollments || [];
  }

  /**
   * Bulk create courses from an uploaded Excel/CSV file buffer.
   * Supported formats: .xlsx, .xls, .csv
   * Required headers (case insensitive): code, name
   * Optional headers: description, status, className, teacherName, schedule
   */
  async bulkCreateFromExcel(buffer: Buffer, schoolId?: string) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new BadRequestException('No sheet found in uploaded file');
      const sheet = workbook.Sheets[sheetName];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!json.length) {
        throw new BadRequestException('Uploaded file is empty');
      }

      const results: any[] = [];
      const errors: any[] = [];
      let successCount = 0;

      for (let i = 0; i < json.length; i++) {
        const row = json[i];
        const lineNumber = i + 2; // account for header row

        // Normalize keys to consistent camelCase
        const normalized: any = {};
        Object.keys(row).forEach(k => {
          const key = k.trim();
          const lower = key.toLowerCase();
          const map: Record<string, string> = {
            'coursecode': 'code',
            'course_code': 'code',
            'coursename': 'name',
            'course_name': 'name',
            'classname': 'className',
            'class_name': 'className',
            'class': 'className',
            'teachername': 'teacherName',
            'teacher_name': 'teacherName',
            'teacher': 'teacherName',
          };
          const mapped = map[lower] || key;
          normalized[mapped] = row[k];
        });

        // Basic validation
        if (!normalized.code || !normalized.name) {
          errors.push({ line: lineNumber, error: 'Missing required fields: code and name are required' });
          continue;
        }

        try {
          // Check for duplicate course code within school
          const existingCourse = await this.courseRepository.findOne({
            where: { 
              code: normalized.code.trim(),
              ...(schoolId && { schoolId })
            }
          });

          if (existingCourse) {
            errors.push({ line: lineNumber, error: `Course with code '${normalized.code}' already exists` });
            continue;
          }

          // Resolve class name to classId if provided
          if (normalized.className && !normalized.classId) {
            const rawClass = String(normalized.className).trim();
            if (rawClass.length) {
              try {
                const simplified = rawClass.toLowerCase();
                const numCandidate = parseInt(simplified.replace(/[^0-9]/g, ''), 10);

                // Try direct case-insensitive name match first
                let classEntity = await this.classRepository.createQueryBuilder('c')
                  .where('LOWER(c.name) = :name', { name: simplified })
                  .andWhere(schoolId ? 'c.schoolId = :sid' : '1=1', schoolId ? { sid: schoolId } : {})
                  .getOne();

                // Fallback: if not found and we have a numeric part, try numericalName
                if (!classEntity && !isNaN(numCandidate)) {
                  classEntity = await this.classRepository.createQueryBuilder('c')
                    .where('c.numericalName = :num', { num: numCandidate })
                    .andWhere(schoolId ? 'c.schoolId = :sid' : '1=1', schoolId ? { sid: schoolId } : {})
                    .getOne();
                }

                // Fallback: loose match (contains) if still not found
                if (!classEntity) {
                  classEntity = await this.classRepository.createQueryBuilder('c')
                    .where('LOWER(c.name) LIKE :like', { like: `%${simplified}%` })
                    .andWhere(schoolId ? 'c.schoolId = :sid' : '1=1', schoolId ? { sid: schoolId } : {})
                    .getOne();
                }

                if (classEntity) {
                  normalized.classId = classEntity.id;
                } else {
                  this.logger.warn(`Class '${rawClass}' not found for course ${normalized.code} at line ${lineNumber}`);
                  // Don't fail the import for missing class, just log warning
                }
              } catch (e) {
                this.logger.error(`Error looking up class '${rawClass}': ${e.message}`);
                // Don't fail the import for class lookup errors
              }
            }
          }

          // Resolve teacher name to teacherId if provided
          if (normalized.teacherName && !normalized.teacherId) {
            const rawTeacher = String(normalized.teacherName).trim();
            if (rawTeacher.length) {
              try {
                // Try to find teacher by name (assuming format: "First Last" or "Last, First")
                const teacherEntity = await this.teacherRepository.createQueryBuilder('t')
                  .leftJoinAndSelect('t.user', 'user')
                  .where('LOWER(CONCAT(user.firstName, \' \', user.lastName)) LIKE :name', { 
                    name: `%${rawTeacher.toLowerCase()}%` 
                  })
                  .andWhere(schoolId ? 't.schoolId = :sid' : '1=1', schoolId ? { sid: schoolId } : {})
                  .getOne();

                if (teacherEntity) {
                  normalized.teacherId = teacherEntity.id;
                } else {
                  this.logger.warn(`Teacher '${rawTeacher}' not found for course ${normalized.code} at line ${lineNumber}`);
                  // Don't fail the import for missing teacher, just log warning
                }
              } catch (e) {
                this.logger.error(`Error looking up teacher '${rawTeacher}': ${e.message}`);
                // Don't fail the import for teacher lookup errors
              }
            }
          }

          // Remove helper fields before creating course
          const { className, teacherName, ...courseDto } = normalized;
          
          // Create course
          const created = await this.create(courseDto as CreateCourseDto, schoolId);
          results.push({ 
            line: lineNumber, 
            id: created.id, 
            code: created.code, 
            name: created.name 
          });
          successCount++;
        } catch (err: any) {
          errors.push({ line: lineNumber, error: err.message });
        }
      }

      return {
        success: errors.length === 0,
        summary: {
          totalRows: json.length,
          created: successCount,
          failed: errors.length,
        },
        created: results,
        errors,
        message: `Processed ${json.length} rows: ${successCount} created, ${errors.length} failed`,
      };
    } catch (e) {
      this.logger.error(`Bulk create failed: ${e.message}`);
      throw new BadRequestException('Failed to process uploaded file: ' + e.message);
    }
  }
}
