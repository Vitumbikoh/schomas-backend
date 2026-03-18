import { Injectable, NotFoundException, Optional, BadRequestException, ForbiddenException } from '@nestjs/common';
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
import { generateUniqueUsername } from './utils/username.util';
import { SettingsService } from 'src/settings/settings.service';

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
    @Optional()
    private readonly settingsService?: SettingsService,
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
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['teacher', 'student', 'parent', 'finance'],
    });
    console.log('UserService.findById - User found:', user ? { id: user.id, username: user.username, role: user.role } : 'null');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    // Deprecated: email is now optional; prefer findByUsername for auth
    if (!email) return null;
    return this.userRepository.findOne({
      where: { email },
      relations: ['teacher', 'student', 'parent', 'finance'],
    });
  }

  async updateLoginActivity(userId: string, loginAt: Date, activityAt: Date): Promise<void> {
    try {
      await this.userRepository.update(userId, {
        lastLoginAt: loginAt,
        lastActivityAt: activityAt,
      });
    } catch (error) {
      // Silently fail if columns don't exist yet (migration pending)
      console.warn('Failed to update login activity (columns may not exist):', error.message);
    }
  }

  async updateActivity(userId: string): Promise<void> {
    try {
      await this.userRepository.update(userId, {
        lastActivityAt: new Date(),
      });
    } catch (error) {
      // Silently fail if column doesn't exist yet (migration pending)
      console.warn('Failed to update activity (column may not exist):', error.message);
    }
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const userSettings = new UserSettings();
    const shouldForcePasswordReset = createUserDto.role !== Role.SUPER_ADMIN;
    const user = this.userRepository.create({
      username: createUserDto.username,
  email: createUserDto.email ?? null,
      password: hashedPassword,
      role: createUserDto.role as Role,
      isActive: true,
      forcePasswordReset: shouldForcePasswordReset,
      schoolId: createUserDto.schoolId ?? null,
      settings: userSettings,
    });
    return this.userRepository.save(user);
  }

  async createTeacher(createTeacherDto: CreateTeacherDto, schoolId?: string): Promise<Teacher> {
    const username = await generateUniqueUsername(
      createTeacherDto.firstName,
      createTeacherDto.lastName,
      this.userRepository,
      createTeacherDto.username,
      '@teacher'
    );
    const user = await this.createUser({
      username,
      email: createTeacherDto.email, // mandatory
      password: createTeacherDto.password,
      role: Role.TEACHER,
      schoolId: schoolId ?? undefined,
    } as any);
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
    let enrollmentTermId = createStudentDto.termId || null;
    if (!enrollmentTermId && this.settingsService) {
      try {
        const currentTerm = await this.settingsService.getCurrentTerm(schoolId);
        enrollmentTermId = currentTerm?.id || null;
      } catch {
        enrollmentTermId = null;
      }
    }

    const student = this.studentRepository.create({
      ...createStudentDto,
      user,
      // Set enrollmentTermId to the term the student is being enrolled in
      // This ensures they're only charged for fees from this term onwards
      enrollmentTermId: enrollmentTermId,
    });
    return this.studentRepository.save(student);
  }

  async createParent(createParentDto: CreateParentDto, schoolId?: string): Promise<Parent> {
    const username = await generateUniqueUsername(
      createParentDto.firstName,
      createParentDto.lastName,
      this.userRepository,
      createParentDto.username,
      '@parent'
    );
    const user = await this.createUser({
      username,
      email: createParentDto.email ?? null,
      password: createParentDto.password,
      role: Role.PARENT,
      schoolId: schoolId ?? undefined,
    } as any);
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
    const username = await generateUniqueUsername(
      createFinanceDto.firstName,
      createFinanceDto.lastName,
      this.userRepository,
      createFinanceDto.username,
      '@finance'
    );
    const user = await this.createUser({
      username,
      email: createFinanceDto.email, // mandatory
      password: createFinanceDto.password,
      role: Role.FINANCE,
      schoolId: schoolId ?? undefined,
    } as any);
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

  async listUsersForPasswordManagement(
    requester: { role?: string; schoolId?: string; sub?: string },
    filters: { page: number; limit: number; search?: string; role?: string; status?: string },
  ) {
    const page = Number.isFinite(filters.page) && filters.page > 0 ? filters.page : 1;
    const limit = Number.isFinite(filters.limit) && filters.limit > 0 ? Math.min(filters.limit, 100) : 10;
    const offset = (page - 1) * limit;
    const requesterRole = (requester?.role || '').toUpperCase();
    const isSuperAdmin = requesterRole === Role.SUPER_ADMIN;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.parent', 'parent')
      .leftJoinAndSelect('user.finance', 'finance');

    if (!isSuperAdmin) {
      if (!requester?.schoolId) {
        throw new ForbiddenException('School scope not found for this admin account');
      }
      qb.andWhere('user.schoolId = :schoolId', { schoolId: requester.schoolId });
      qb.andWhere('user.role != :superRole', { superRole: Role.SUPER_ADMIN });
    }

    if (filters.role && filters.role !== 'all') {
      qb.andWhere('user.role = :role', { role: String(filters.role).toUpperCase() });
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'active') qb.andWhere('user.isActive = true');
      if (filters.status === 'inactive') qb.andWhere('user.isActive = false');
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      qb.andWhere(
        '(user.username ILIKE :term OR user.email ILIKE :term OR teacher.firstName ILIKE :term OR teacher.lastName ILIKE :term OR student.firstName ILIKE :term OR student.lastName ILIKE :term OR parent.firstName ILIKE :term OR parent.lastName ILIKE :term OR finance.firstName ILIKE :term OR finance.lastName ILIKE :term)',
        { term },
      );
    }

    qb.orderBy('user.createdAt', 'DESC').skip(offset).take(limit);

    const [users, totalItems] = await qb.getManyAndCount();

    const mapped = users.map((u) => {
      const profile = u.teacher || u.student || u.parent || u.finance;
      const firstName = (profile as any)?.firstName || '';
      const lastName = (profile as any)?.lastName || '';
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        forcePasswordReset: u.forcePasswordReset,
        schoolId: u.schoolId,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim() || u.username,
        lastLoginAt: u.lastLoginAt,
      };
    });

    return {
      users: mapped,
      pagination: {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
        totalItems,
        itemsPerPage: limit,
      },
    };
  }

  async adminResetPassword(
    requester: { role?: string; schoolId?: string; sub?: string },
    targetUserId: string,
    newTemporaryPassword: string,
    forceResetOnNextLogin = true,
  ) {
    if (!newTemporaryPassword || newTemporaryPassword.length < 8) {
      throw new BadRequestException('Temporary password must be at least 8 characters long');
    }

    const requesterRole = (requester?.role || '').toUpperCase();
    const isSuperAdmin = requesterRole === Role.SUPER_ADMIN;

    const targetUser = await this.userRepository.findOne({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (!isSuperAdmin) {
      if (!requester?.schoolId || !targetUser.schoolId || requester.schoolId !== targetUser.schoolId) {
        throw new ForbiddenException('You can only reset passwords for users in your school');
      }
      if (targetUser.role === Role.SUPER_ADMIN) {
        throw new ForbiddenException('Admin cannot reset super admin passwords');
      }
    }

    targetUser.password = await bcrypt.hash(newTemporaryPassword, 10);
    targetUser.forcePasswordReset = forceResetOnNextLogin as any;
    targetUser.updatedAt = new Date();
    await this.userRepository.save(targetUser);

    return {
      ok: true,
      targetRole: targetUser.role,
      targetSchoolId: targetUser.schoolId,
    };
  }

  // Count users by SUPER_ADMIN role (bootstrap logic)
  async countSuperAdmins(): Promise<number> {
    return this.userRepository.count({ where: { role: Role.SUPER_ADMIN as any } });
  }
}
