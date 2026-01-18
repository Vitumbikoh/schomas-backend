import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, DataSource } from 'typeorm';
import { School } from './entities/school.entity';
import { SchoolAdminCredentials } from './entities/school-admin-credentials.entity';
import { User } from '../user/entities/user.entity';
import { Class } from '../classes/entity/class.entity';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../user/user.service';
import { Role } from '../user/enums/role.enum';
import { SchoolAdminCredentialsDto, SchoolAdminCredentialsListDto } from './dto/school-admin-credentials.dto';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType, NotificationPriority } from '../notifications/entities/notification.entity';

interface CreateSchoolDto {
  name: string;
  code: string;
  metadata?: Record<string, any>;
  // Optional flag to seed default data
  seedDefaults?: boolean;
}

interface UpdateSchoolDto {
  name?: string;
  code?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  metadata?: Record<string, any>;
}

@Injectable()
export class SchoolsService {
  constructor(
    @InjectRepository(School) private repo: Repository<School>,
    @InjectRepository(SchoolAdminCredentials) private credentialsRepo: Repository<SchoolAdminCredentials>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateSchoolDto) {
    // Enforce uniqueness of code & name early
    const existing = await this.repo.findOne({ where: [{ code: dto.code }, { name: dto.name }] });
    if (existing) {
      throw new BadRequestException('School name or code already exists');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const schoolEntity = manager.create(School, {
        name: dto.name,
        code: dto.code,
        metadata: dto.metadata ?? {},
        status: 'ACTIVE',
      });
      const school = await manager.save(schoolEntity);

      // Always auto-provision an initial ADMIN account with predefined credentials
      const { username, email, password, displayPassword } = this.generateAdminCredentials(school.name, school.code);
      
      // Check if username already exists and add suffix if needed
      const adminRepo = manager.getRepository(User);
      let finalUsername = username;
      let counter = 1;
      while (await adminRepo.findOne({ where: { username: finalUsername } })) {
        finalUsername = `${username}${counter}`;
        counter++;
      }
      
      const hashed = await bcrypt.hash(password, 10);
      const adminUser = adminRepo.create({
        username: finalUsername,
        email,
        password: hashed,
        role: Role.ADMIN,
        schoolId: school.id,
        isActive: true,
        forcePasswordReset: true,
      });
      await adminRepo.save(adminUser);

      // Store the credentials for super admin reference
      const credentialsRepo = manager.getRepository(SchoolAdminCredentials);
      const adminCredentials = credentialsRepo.create({
        schoolId: school.id,
        username: finalUsername,
        email,
        password: displayPassword, // Store plain text password for super admin reference
        isActive: true,
        passwordChanged: false,
      });
      await credentialsRepo.save(adminCredentials);

      if (dto.seedDefaults) {
        await this.seedDefaults(school.id);
      }

      return {
        school,
        admin: {
          id: adminUser.id,
          username: finalUsername,
          email: adminUser.email,
          tempPassword: displayPassword, // show only once to caller
          forcePasswordReset: true,
        },
        seeded: !!dto.seedDefaults,
        finalUsername,
        email
      };
    });

    // Create notification AFTER the transaction is committed
    try {
      console.log(`🔔 Creating notification for school: ${result.school.name} (${result.school.id})`);
      const notification = await this.notificationService.create({
        title: 'New School Created',
        message: `School "${result.school.name}" (${result.school.code}) has been successfully created with admin account`,
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.HIGH,
        schoolId: result.school.id,
        metadata: {
          schoolId: result.school.id,
          schoolName: result.school.name,
          schoolCode: result.school.code,
          adminUsername: result.finalUsername,
          adminEmail: result.email
        }
      });
      console.log(`✅ School creation notification created:`, notification.id);
    } catch (error) {
      console.error('❌ Failed to create school creation notification:', error);
      console.error('Error details:', error.stack);
    }

    return {
      school: result.school,
      admin: {
        id: result.admin.id,
        username: result.finalUsername,
        email: result.admin.email,
        tempPassword: result.admin.tempPassword,
        forcePasswordReset: true,
      },
      seeded: result.seeded,
    };
  }

  // Seed default data for new schools
  async seedDefaults(schoolId: string) {
    const classRepo = this.dataSource.getRepository(Class);
    
    // Create the default "Graduated" class for the school
    const graduatedClass = classRepo.create({
      name: 'Graduated',
      numericalName: 999, // Very high number to ensure it's always last
      description: 'Default graduation class for completed students',
      isActive: true,
      schoolId: schoolId,
    });
    
    await classRepo.save(graduatedClass);
    
    return { 
      schoolId, 
      status: 'OK', 
      graduatedClassId: graduatedClass.id 
    };
  }

  findAll(search?: string) {
    // Return schools enriched with aggregated counts of students & teachers
    // Using raw query builder with LEFT JOINs and grouped counts for efficiency.
    const qb = this.repo.createQueryBuilder('school')
      .leftJoin(User, 'stu', 'stu."schoolId" = school.id AND stu.role = :studentRole', { studentRole: Role.STUDENT })
      .leftJoin(User, 'tch', 'tch."schoolId" = school.id AND tch.role = :teacherRole', { teacherRole: Role.TEACHER })
      .select('school.id', 'id')
      .addSelect('school.name', 'name')
      .addSelect('school.code', 'code')
      .addSelect('school.status', 'status')
      .addSelect('school.metadata', 'metadata')
      .addSelect('school.createdAt', 'createdAt')
      .addSelect('school.updatedAt', 'updatedAt')
      .addSelect('COUNT(DISTINCT stu.id)', 'students')
      .addSelect('COUNT(DISTINCT tch.id)', 'teachers')
      .groupBy('school.id')
      .orderBy('school.createdAt', 'DESC');

    if (search) {
      qb.where('school.name ILIKE :search OR school.code ILIKE :search', { search: `%${search}%` });
    }

    return qb.getRawMany().then(rows => rows.map(r => ({
      ...r,
      students: parseInt(r.students, 10) || 0,
      teachers: parseInt(r.teachers, 10) || 0,
    })));
  }

  async findOne(id: string) {
    const school = await this.repo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto) {
    const school = await this.findOne(id);
    const originalData = { ...school };
    Object.assign(school, dto);
    const updatedSchool = await this.repo.save(school);

    // Create notification for school update
    try {
      const changes = [];
      if (dto.name && dto.name !== originalData.name) changes.push(`name changed to "${dto.name}"`);
      if (dto.code && dto.code !== originalData.code) changes.push(`code changed to "${dto.code}"`);
      if (dto.status && dto.status !== originalData.status) changes.push(`status changed to ${dto.status}`);
      
      if (changes.length > 0) {
        await this.notificationService.create({
          title: 'School Information Updated',
          message: `School "${updatedSchool.name}" has been updated: ${changes.join(', ')}`,
          type: NotificationType.SYSTEM,
          priority: NotificationPriority.MEDIUM,
          schoolId: updatedSchool.id,
          metadata: {
            schoolId: updatedSchool.id,
            schoolName: updatedSchool.name,
            changes: dto,
            originalData: { name: originalData.name, code: originalData.code, status: originalData.status }
          }
        });
      }
    } catch (error) {
      console.error('Failed to create school update notification:', error);
    }

    return updatedSchool;
  }

  async suspend(id: string) {
    const school = await this.findOne(id);
    const updatedSchool = await this.update(id, { status: 'SUSPENDED' });

    // Create specific notification for suspension
    try {
      await this.notificationService.create({
        title: 'School Suspended',
        message: `School "${school.name}" (${school.code}) has been suspended. Access has been restricted.`,
        type: NotificationType.ALERT,
        priority: NotificationPriority.HIGH,
        schoolId: school.id,
        metadata: {
          schoolId: school.id,
          schoolName: school.name,
          previousStatus: school.status,
          action: 'suspended'
        }
      });
    } catch (error) {
      console.error('Failed to create school suspension notification:', error);
    }

    return updatedSchool;
  }

  async activate(id: string) {
    const school = await this.findOne(id);
    const updatedSchool = await this.update(id, { status: 'ACTIVE' });

    // Create specific notification for activation
    try {
      await this.notificationService.create({
        title: 'School Activated',
        message: `School "${school.name}" (${school.code}) has been activated. Access has been restored.`,
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.MEDIUM,
        schoolId: school.id,
        metadata: {
          schoolId: school.id,
          schoolName: school.name,
          previousStatus: school.status,
          action: 'activated'
        }
      });
    } catch (error) {
      console.error('Failed to create school activation notification:', error);
    }

    return updatedSchool;
  }

  private generateAdminCredentials(name: string, code: string) {
    // Extract first word from school name and convert to lowercase
    const firstWord = name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Ensure we have at least a fallback if first word is empty after cleaning
    const cleanFirstWord = firstWord || 'school';
    const username = `${cleanFirstWord}admin`;
    
    // Email format: admin@schoolcode.com (clean code for valid domain)
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const email = `admin@${cleanCode}.com`;
    
    // Default password (admin will change on first login)
    const password = '12345678';
    
    return { username, email, password, displayPassword: password };
  }

  /**
   * Get all school admin credentials (Super Admin only)
   */
  async getAllSchoolCredentials(page: number = 1, limit: number = 10, search?: string): Promise<SchoolAdminCredentialsListDto> {
    const queryBuilder = this.credentialsRepo.createQueryBuilder('cred')
      .leftJoinAndSelect('cred.school', 'school')
      .orderBy('cred.createdAt', 'DESC');

    if (search) {
      queryBuilder.where(
        'school.name ILIKE :search OR school.code ILIKE :search OR cred.username ILIKE :search OR cred.email ILIKE :search',
        { search: `%${search}%` }
      );
    }

    const [credentials, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const credentialsDto: SchoolAdminCredentialsDto[] = credentials.map(cred => ({
      id: cred.id,
      schoolId: cred.schoolId,
      schoolName: cred.school.name,
      schoolCode: cred.school.code,
      username: cred.username,
      email: cred.email,
      password: cred.password,
      isActive: cred.isActive,
      passwordChanged: cred.passwordChanged,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
    }));

    return {
      credentials: credentialsDto,
      total,
      page,
      limit,
    };
  }

  /**
   * Get credentials for a specific school (Super Admin only)
   */
  async getSchoolCredentials(schoolId: string): Promise<SchoolAdminCredentialsDto> {
    const credentials = await this.credentialsRepo.findOne({
      where: { schoolId },
      relations: ['school'],
    });

    if (!credentials) {
      throw new NotFoundException('School admin credentials not found');
    }

    return {
      id: credentials.id,
      schoolId: credentials.schoolId,
      schoolName: credentials.school.name,
      schoolCode: credentials.school.code,
      username: credentials.username,
      email: credentials.email,
      password: credentials.password,
      isActive: credentials.isActive,
      passwordChanged: credentials.passwordChanged,
      createdAt: credentials.createdAt,
      updatedAt: credentials.updatedAt,
    };
  }

  /**
   * Update password changed status when admin changes password
   */
  async markPasswordChanged(schoolId: string): Promise<void> {
    await this.credentialsRepo.update(
      { schoolId },
      { passwordChanged: true, updatedAt: new Date() }
    );
  }

  /**
   * Reset admin password (Super Admin only)
   */
  async resetAdminPassword(schoolId: string): Promise<{ newPassword: string }> {
    const school = await this.findOne(schoolId);
    const { password: newPassword } = this.generateAdminCredentials(school.name, school.code);
    
    return this.dataSource.transaction(async (manager) => {
      // Update user password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await manager.update(User, 
        { schoolId, role: Role.ADMIN }, 
        { 
          password: hashedPassword, 
          forcePasswordReset: true,
          updatedAt: new Date(),
        }
      );

      // Update stored credentials
      await manager.update(SchoolAdminCredentials,
        { schoolId },
        { 
          password: newPassword,
          passwordChanged: false,
          updatedAt: new Date(),
        }
      );

      return { newPassword };
    });
  }
}
