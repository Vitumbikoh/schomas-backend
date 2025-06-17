import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Teacher } from './entities/teacher.entity';
import { Student } from './entities/student.entity';
import { Parent } from './entities/parent.entity';
import { Finance } from './entities/finance.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { CreateTeacherDto } from './dtos/create-teacher.dto';
import { CreateStudentDto } from './dtos/create-student.dto';
import { CreateParentDto } from './dtos/create-parent.dto';
import { CreateFinanceDto } from './dtos/create-finance.dto';
import { Role } from './enums/role.enum';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from 'src/parent/dtos/update-parent.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
    @InjectRepository(Finance)
    private readonly financeRepository: Repository<Finance>,
  ) {}

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ 
      where: { id },
      relations: ['teacher', 'student', 'parent', 'finance']
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ 
      where: { email },
      relations: ['teacher', 'student', 'parent', 'finance']
    });
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      username: createUserDto.username,
      email: createUserDto.email,
      password: hashedPassword,
      role: createUserDto.role as Role,
      isActive: true
    });
    return this.userRepository.save(user);
  }

  async createTeacher(createTeacherDto: CreateTeacherDto): Promise<Teacher> {
    const userDto: CreateUserDto = {
      username: createTeacherDto.username,
      email: createTeacherDto.email,
      password: createTeacherDto.password,
      role: Role.TEACHER,
    };

    const user = await this.createUser(userDto);
    const teacher = this.teacherRepository.create({
      ...createTeacherDto,
      user,
    });
    return this.teacherRepository.save(teacher);
  }

  async createStudent(createStudentDto: CreateStudentDto): Promise<Student> {
    const userDto: CreateUserDto = {
      username: createStudentDto.username,
      email: createStudentDto.email,
      password: createStudentDto.password,
      role: Role.STUDENT,
    };

    const user = await this.createUser(userDto);
    const student = this.studentRepository.create({
      ...createStudentDto,
      user,
    });
    return this.studentRepository.save(student);
  }

  async createParent(createParentDto: CreateParentDto): Promise<Parent> {
    const userDto: CreateUserDto = {
      username: createParentDto.username,
      email: createParentDto.email,
      password: createParentDto.password,
      role: Role.PARENT,
    };

    const user = await this.createUser(userDto);
    const parent = this.parentRepository.create({
      ...createParentDto,
      user,
    });
    return this.parentRepository.save(parent);
  }

  // users.service.ts
async updateUser(id: string, updateUserDto: UpdateUserDto) {
  const user = await this.userRepository.findOne({ where: { id } });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  // Update all fields including role
  Object.assign(user, updateUserDto);
  user.updatedAt = new Date();
  
  return this.userRepository.save(user);
}
  async createFinance(createFinanceDto: CreateFinanceDto): Promise<Finance> {
    const userDto: CreateUserDto = {
      username: createFinanceDto.username,
      email: createFinanceDto.email,
      password: createFinanceDto.password,
      role: Role.FINANCE,
    };

    const user = await this.createUser(userDto);
    const finance = this.financeRepository.create({
      ...createFinanceDto,
      user,
    });
    return this.financeRepository.save(finance);
  }

  async findAllTeachers(): Promise<Teacher[]> {
    return this.teacherRepository.find({ relations: ['user'] });
  }

  async findAllStudents(): Promise<Student[]> {
    return this.studentRepository.find({ relations: ['user'] });
  }

  async findAllParents(): Promise<Parent[]> {
    return this.parentRepository.find({ relations: ['user'] });
  }

  async findAllFinance(): Promise<Finance[]> {
    return this.financeRepository.find({ relations: ['user'] });
  }
}