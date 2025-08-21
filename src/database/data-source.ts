// src/database/data-source.ts
import { Course } from '../course/entities/course.entity';
import { Student } from '../user/entities/student.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { User } from '../user/entities/user.entity';
import { DataSource } from 'typeorm';
import { School } from '../school/entities/school.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'g1Bird fly',
  database: process.env.DB_DATABASE || 'schomas',
  entities: [User, Teacher, Course, Student, School],
  synchronize: process.env.NODE_ENV !== 'production',
  // synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});