import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, DataSource } from 'typeorm';
import { School } from './entities/school.entity';
import { SchoolAdminCredentials } from './entities/school-admin-credentials.entity';
import { User } from '../user/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../user/user.service';
import { Role } from '../user/enums/role.enum';
import { SchoolAdminCredentialsDto, SchoolAdminCredentialsListDto } from './dto/school-admin-credentials.dto';

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
  ) {}

  async create(dto: CreateSchoolDto) {
    // Enforce uniqueness of code & name early
    const existing = await this.repo.findOne({ where: [{ code: dto.code }, { name: dto.name }] });
    if (existing) {
      throw new BadRequestException('School name or code already exists');
    }

    return this.dataSource.transaction(async (manager) => {
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
      };
    });
  }

  // Placeholder for seeding default tenant data (periods, fee categories, etc.)
  async seedDefaults(schoolId: string) {
    // TODO: implement actual seeding of default term, roles, etc.
    return { schoolId, status: 'OK' };
  }

  findAll(search?: string) {
    if (search) {
      return this.repo.find({ where: [{ name: ILike(`%${search}%`) }, { code: ILike(`%${search}%`) }] });
    }
    return this.repo.find();
  }

  async findOne(id: string) {
    const school = await this.repo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto) {
    const school = await this.findOne(id);
    Object.assign(school, dto);
    return this.repo.save(school);
  }

  async suspend(id: string) {
    return this.update(id, { status: 'SUSPENDED' });
  }

  async activate(id: string) {
    return this.update(id, { status: 'ACTIVE' });
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
