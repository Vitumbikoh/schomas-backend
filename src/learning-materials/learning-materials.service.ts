import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningMaterial } from './entities/learning-material.entity';
import { Role } from 'src/user/enums/role.enum';
import { diskStorage } from 'multer';
import type * as multer from 'multer';
import type { File as MulterFile } from 'multer';
import { extname } from 'path';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { User } from 'src/user/entities/user.entity';
import { CreateLearningMaterialDto } from './dtos/create-learning-material.dto';
import { StudentMaterialDto } from './dtos/student-material.dto';
import * as fs from 'fs';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';

@Injectable()
export class LearningMaterialsService {
  constructor(
    @InjectRepository(LearningMaterial)
    private learningMaterialRepository: Repository<LearningMaterial>,
    @InjectRepository(Class)
    private classRepository: Repository<Class>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Enrollment)
    private enrollmentRepository: Repository<Enrollment>,
  ) {}

  static storageOptions = diskStorage({
    destination: './Uploads',
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const baseName = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 200);
      const finalName = `${baseName}-${uniqueSuffix}${ext}`.substring(0, 255);
      callback(null, finalName);
    },
  });

  async createLearningMaterial(
    createLearningMaterialDto: CreateLearningMaterialDto,
    file: MulterFile,
    userId: string,
  ): Promise<LearningMaterial> {
    const { classId, courseId, title, description } = createLearningMaterialDto;

    console.log('Received DTO:', createLearningMaterialDto);
    console.log('File object:', file);
    console.log('File path:', file.path);
    console.log('User ID from JWT:', userId);

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.TEACHER },
    });
    if (!user) {
      console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
      throw new ForbiddenException('Invalid user authentication');
    }

    const teacher = await this.teacherRepository.findOne({ where: { userId } });
    if (!teacher) {
      console.log(`Teacher not found for user ID: ${userId}`);
      throw new NotFoundException('Your teacher record was not found');
    }

    const classEntity = await this.classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      console.log(`Class not found for id: ${classId}`);
      throw new BadRequestException('Invalid class');
    }

    const course = await this.courseRepository.findOne({
      where: { id: courseId, classId, teacher: { id: teacher.id } },
      relations: ['teacher'],
    });
    if (!course) {
      console.log(`Course ${courseId} not found or not assigned to teacher ${teacher.id} in class ${classId}`);
      throw new BadRequestException('Invalid course or teacher not assigned');
    }

    const learningMaterial = new LearningMaterial();
    learningMaterial.class = classEntity;
    learningMaterial.course = course;
    learningMaterial.teacher = user;
    learningMaterial.title = title;
    learningMaterial.description = description ?? '';
    learningMaterial.filePath = file.path;

    try {
      const savedMaterial = await this.learningMaterialRepository.save(learningMaterial);
      console.log(`Learning material saved: ${savedMaterial.id}`);
      return savedMaterial;
    } catch (error) {
      console.error('Database error:', error);
      throw new BadRequestException(`Failed to save learning material: ${error.message}`);
    }
  }

  async getStudentMaterials(studentId: string, courseId?: string): Promise<StudentMaterialDto[]> {
    try {
      // Fetch student's enrolled courses
      const enrollments = await this.enrollmentRepository.find({
        where: { student: { userId: studentId } },
        relations: ['course'],
      });

      const courseIds = enrollments.map(enrollment => enrollment.course.id);

      // Fetch materials for enrolled courses
      const query = this.learningMaterialRepository
        .createQueryBuilder('material')
        .leftJoinAndSelect('material.course', 'course')
        .where('material.courseId IN (:...courseIds)', { courseIds });

      if (courseId) {
        query.andWhere('material.courseId = :courseId', { courseId });
      }

      const materials = await query.getMany();

      return materials.map(material => ({
        id: material.id,
        title: material.title,
        description: material.description,
        course: material.course.name,
        courseId: material.course.id,
        type: extname(material.filePath).toUpperCase().replace('.', ''),
        uploadedOn: material.createdAt.toISOString(),
        size: this.getFileSize(material.filePath),
        filePath: material.filePath,
      }));
    } catch (error) {
      console.error(`Failed to fetch materials for student ${studentId}:`, error);
      throw new Error(`Failed to fetch student materials: ${error.message}`);
    }
  }

  private getFileSize(filePath: string): string {
    try {
      const stats = fs.statSync(filePath);
      const sizeInMB = (stats.size / 1024 / 1024).toFixed(1);
      return `${sizeInMB} MB`;
    } catch (error) {
      console.error(`Failed to get file size for ${filePath}:`, error);
      return 'Unknown';
    }
  }
}