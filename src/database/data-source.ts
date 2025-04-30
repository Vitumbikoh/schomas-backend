// src/database/data-source.ts
import { Course } from 'src/course/entities/course.entity';
import { Student } from 'src/user/entities/student.entity';
import { Teacher } from 'src/user/entities/teacher.entity';
import { User } from 'src/user/entities/user.entity';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'g1Bird fly',
  database: process.env.DB_DATABASE || 'schomas',
  entities: [User, Teacher, Course, Student],
  // synchronize: process.env.NODE_ENV !== 'production',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});