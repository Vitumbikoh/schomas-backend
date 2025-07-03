import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from 'src/user/enums/role.enum';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Class } from 'src/classes/entity/class.entity';
import { Course } from 'src/course/entities/course.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { User } from 'src/user/entities/user.entity';
import { CreateLearningMaterialDto } from './dtos/create-learning-material.dto';
import { LearningMaterial } from './entities/learning-material.entity';
import { File as MulterFile } from 'multer';

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
  ) {}

  // Multer storage configuration
  static storageOptions = diskStorage({
    destination: './uploads',
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  });

  async getClassesForTeacher(userId: string): Promise<Class[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.TEACHER },
    });
    if (!user) {
      console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
      throw new UnauthorizedException('User is not a teacher or does not exist');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { userId: userId },
    });
    if (!teacher) {
      console.log(`No Teacher found for userId: ${userId}`);
      throw new UnauthorizedException('No Teacher profile associated with this user');
    }

    const courses = await this.courseRepository.find({
      where: { teacher: { id: teacher.id } },
      relations: ['class'],
    });

    const classIds = [...new Set(courses.map((course) => course.classId))];
    return this.classRepository.find({
      where: { id: In(classIds) },
    });
  }

  async getCoursesForClass(userId: string, classId: string): Promise<Course[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.TEACHER },
    });
    if (!user) {
      console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
      throw new UnauthorizedException('User is not a teacher or does not exist');
    }

    const teacher = await this.teacherRepository.findOne({
      where: { userId: userId },
    });
    if (!teacher) {
      console.log(`No Teacher found for userId: ${userId}`);
      throw new UnauthorizedException('No Teacher profile associated with this user');
    }

    return this.courseRepository.find({
      where: { classId, teacher: { id: teacher.id } },
      select: ['id', 'name', 'code'],
    });
  }

  async createLearningMaterial(
    createLearningMaterialDto: CreateLearningMaterialDto,
    file: MulterFile,
    userId: string,
  ): Promise<LearningMaterial> {
    const { classId, courseId, title, description } = createLearningMaterialDto;

    // Log for debugging
    console.log('Received DTO:', createLearningMaterialDto);
    console.log('File:', file?.filename);
    console.log('User ID from JWT:', userId);

    // Validate inputs
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate user
    const user = await this.userRepository.findOne({
      where: { id: userId, role: Role.TEACHER },
    });
    if (!user) {
      console.log(`No User found with id: ${userId} and role: ${Role.TEACHER}`);
      throw new UnauthorizedException('User is not a teacher or does not exist');
    }

    // Fetch teacher
    const teacher = await this.teacherRepository.findOne({
      where: { userId: userId },
    });
    if (!teacher) {
      console.log(`No Teacher found for userId: ${userId}`);
      throw new UnauthorizedException('No Teacher profile associated with this user');
    }

    // Validate class
    const classEntity = await this.classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      throw new BadRequestException('Invalid class');
    }

    // Validate course
    const course = await this.courseRepository.findOne({
      where: { id: courseId, classId, teacher: { id: teacher.id } },
      relations: ['teacher'],
    });
    if (!course) {
      console.log(`Course ${courseId} not found or not assigned to teacher ${teacher.id} in class ${classId}`);
      throw new BadRequestException('Invalid course or teacher not assigned');
    }

    // Create learning material
    const learningMaterial = new LearningMaterial();
    learningMaterial.class = classEntity;
    learningMaterial.course = course;
    learningMaterial.teacher = user;
    learningMaterial.title = title;
    learningMaterial.description = description ?? '';
    learningMaterial.filePath = file.filename;

    // Save to database
    return this.learningMaterialRepository.save(learningMaterial);
  }
}