import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { Book } from './entities/book.entity';
import { Borrowing } from './entities/borrowing.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../user/users.module';
import { ConfigModule } from '../config/config.module';
import { Student } from '../user/entities/student.entity';
import { Class } from '../classes/entity/class.entity';

@Module({
  imports: [
  TypeOrmModule.forFeature([Book, Borrowing, Student, Class]),
  forwardRef(() => AuthModule),
  forwardRef(() => UsersModule),
  ConfigModule,
  ],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
