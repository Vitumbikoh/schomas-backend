import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, DataSource } from 'typeorm';
import { School } from './entities/school.entity';
import { User } from '../user/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../user/user.service';
import { Role } from '../user/enums/role.enum';

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

  // Placeholder for seeding default tenant data (terms, fee categories, etc.)
  async seedDefaults(schoolId: string) {
    // TODO: implement actual seeding of default academic year, roles, etc.
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
}
