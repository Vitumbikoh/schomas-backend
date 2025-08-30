import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserSettings } from 'src/settings/entities/user-settings.entity';
import { Teacher } from './entities/teacher.entity';
import { Student } from './entities/student.entity';
import { Parent } from './entities/parent.entity';
import { Finance } from './entities/finance.entity';
import { SchoolAdminCredentials } from '../school/entities/school-admin-credentials.entity';
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
    @InjectRepository(SchoolAdminCredentials)
    @Optional()
    private readonly schoolAdminCredentialsRepository?: Repository<SchoolAdminCredentials>,
  ) {}

  // In user.service.ts
  async findOne(id: string, options?: FindOneOptions<User>) {
    return this.userRepository.findOne({
      where: { id },
      ...options,
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['teacher', 'student', 'parent', 'finance'],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    // Deprecated: email is now optional; prefer findByUsername for auth
    if (!email) return null;
    return this.userRepository.findOne({
      where: { email },
      relations: ['teacher', 'student', 'parent', 'finance'],
    });
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const userSettings = new UserSettings();
    const user = this.userRepository.create({
      username: createUserDto.username,
  email: createUserDto.email ?? null,
      password: hashedPassword,
      role: createUserDto.role as Role,
      isActive: true,
      schoolId: createUserDto.schoolId ?? null,
      settings: userSettings,
    });
    return this.userRepository.save(user);
  }

  async createTeacher(createTeacherDto: CreateTeacherDto, schoolId?: string): Promise<Teacher> {
    const userDto: CreateUserDto = {
      username: createTeacherDto.username,
      email: createTeacherDto.email,
      password: createTeacherDto.password,
      role: Role.TEACHER,
      schoolId: schoolId ?? undefined,
    } as any;

    const user = await this.createUser(userDto);
    const teacher = this.teacherRepository.create({
      ...createTeacherDto,
      user,
    });
    return this.teacherRepository.save(teacher);
  }

  async createStudent(createStudentDto: CreateStudentDto, schoolId?: string): Promise<Student> {
    const userDto: CreateUserDto = {
  username: createStudentDto.username || '', // will be replaced later if empty by student service path
      email: createStudentDto.email,
      password: createStudentDto.password,
      role: Role.STUDENT,
      schoolId: schoolId ?? undefined,
    } as any;

    if (!userDto.username) {
      // Simple fallback to temporary placeholder; actual generation should occur in StudentsService path
      userDto.username = `temp_${Date.now().toString(36)}`;
    }
    const user = await this.createUser(userDto);
    const student = this.studentRepository.create({
      ...createStudentDto,
      user,
    });
    return this.studentRepository.save(student);
  }

  async createParent(createParentDto: CreateParentDto, schoolId?: string): Promise<Parent> {
    const userDto: CreateUserDto = {
      username: createParentDto.username,
      email: createParentDto.email,
      password: createParentDto.password,
      role: Role.PARENT,
      schoolId: schoolId ?? undefined,
    } as any;

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
  async createFinance(createFinanceDto: CreateFinanceDto, schoolId?: string): Promise<Finance> {
    const userDto: CreateUserDto = {
      username: createFinanceDto.username,
      email: createFinanceDto.email,
      password: createFinanceDto.password,
      role: Role.FINANCE,
      schoolId: schoolId ?? undefined,
    } as any;

    const user = await this.createUser(userDto);
    const finance = this.financeRepository.create({
      ...createFinanceDto,
      user,
    });
    return this.financeRepository.save(finance);
  }

  // Change password (supports first-login force reset where old password may be skipped)
  async changePassword(userId: string, newPassword: string, oldPassword?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.forcePasswordReset) {
      if (!oldPassword) throw new NotFoundException('Current password required');
      const valid = await bcrypt.compare(oldPassword, user.password);
      if (!valid) throw new NotFoundException('Current password incorrect');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.forcePasswordReset = false as any;
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    // If this is a school admin, mark password as changed in credentials table
    if (user.role === Role.ADMIN && user.schoolId && this.schoolAdminCredentialsRepository) {
      await this.schoolAdminCredentialsRepository.update(
        { schoolId: user.schoolId },
        { passwordChanged: true, updatedAt: new Date() }
      );
    }

    return { ok: true };
  }

  async findAllTeachers(schoolId?: string, superAdmin = false): Promise<Teacher[]> {
    if (superAdmin && !schoolId) {
      return this.teacherRepository.find({ relations: ['user'] });
    }
    if (!schoolId) return [];
    return this.teacherRepository
      .createQueryBuilder('teacher')
      .leftJoinAndSelect('teacher.user', 'user')
      .where('user.schoolId = :schoolId', { schoolId })
      .getMany();
  }

  async findAllStudents(schoolId?: string, superAdmin = false): Promise<Student[]> {
    if (superAdmin && !schoolId) {
      return this.studentRepository.find({ relations: ['user'] });
    }
    if (!schoolId) return [];
    return this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .where('user.schoolId = :schoolId', { schoolId })
      .getMany();
  }

  async findAllParents(schoolId?: string, superAdmin = false): Promise<Parent[]> {
    if (superAdmin && !schoolId) {
      return this.parentRepository.find({ relations: ['user'] });
    }
    if (!schoolId) return [];
    return this.parentRepository
      .createQueryBuilder('parent')
      .leftJoinAndSelect('parent.user', 'user')
      .where('user.schoolId = :schoolId', { schoolId })
      .getMany();
  }

  async findAllFinance(schoolId?: string, superAdmin = false): Promise<Finance[]> {
    if (superAdmin && !schoolId) {
      return this.financeRepository.find({ relations: ['user'] });
    }
    if (!schoolId) return [];
    return this.financeRepository
      .createQueryBuilder('finance')
      .leftJoinAndSelect('finance.user', 'user')
      .where('user.schoolId = :schoolId', { schoolId })
      .getMany();
  }

  // Count users by SUPER_ADMIN role (bootstrap logic)
  async countSuperAdmins(): Promise<number> {
    return this.userRepository.count({ where: { role: Role.SUPER_ADMIN as any } });
  }
}
