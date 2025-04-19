import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Teacher } from './entities/teacher.entity';
import { Student } from './entities/student.entity';
import { Parent } from './entities/parent.entity';
import { Finance } from './entities/finance.entity';
import { DatabaseModule } from '../database/database.module';
import { UsersService } from './user.service';
import { ConfigModule } from 'src/config/config.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Teacher, Student, Parent, Finance]),
    forwardRef(() => AuthModule),  // Circular dependency resolution
    DatabaseModule,
    ConfigModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}