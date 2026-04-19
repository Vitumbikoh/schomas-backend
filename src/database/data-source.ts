// src/database/data-source.ts
import { Course } from '../course/entities/course.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { User } from '../user/entities/user.entity';
import { DataSource } from 'typeorm';
import { School } from '../school/entities/school.entity';
import { ConfigService } from '../config/config.service';

const configService = new ConfigService();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get('DB_HOST'),
  port: configService.getNumber('DB_PORT'),
  username: configService.get('DB_USERNAME'),
  password: configService.get('DB_PASSWORD'),
  database: configService.get('DB_DATABASE'),
  entities: [User, Teacher, Course, Student, School],
  synchronize: configService.getOptional('NODE_ENV', 'development') !== 'production',
  // synchronize: false,
  logging: configService.getOptional('NODE_ENV', 'development') === 'development',
});