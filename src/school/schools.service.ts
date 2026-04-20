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
import { PackageCatalog } from './entities/package-catalog.entity';

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

export type PackageId = 'normal' | 'silver' | 'golden';

type PackagePricing = Record<PackageId, number>;

type PackageRoleAccess = {
  admin: string;
  teacher: string;
  student: string;
  finance: string;
};

type PackageCatalogItem = {
  id: PackageId;
  name: string;
  description: string;
  modules: string[];
  roleAccess: PackageRoleAccess;
  price: number;
};

const DEFAULT_PRICING: PackagePricing = {
  normal: 120,
  silver: 200,
  golden: 300,
};

const NORMAL_MODULES = [
  'Students',
  'Teachers',
  'Courses',
  'Exams',
  'Reports',
  'Class & Schedule Setup',
  'Notices & Messages',
];

const BASE_CATALOG: Omit<PackageCatalogItem, 'price'>[] = [
  {
    id: 'normal',
    name: 'Normal Package',
    description: 'Everything except Finance and Library.',
    modules: NORMAL_MODULES,
    roleAccess: {
      admin: 'All normal modules; no Finance and no Library.',
      teacher: 'Full teaching modules and reports.',
      student: 'Full student learning modules and reports.',
      finance: 'No access in this package.',
    },
  },
  {
    id: 'silver',
    name: 'Silver Package',
    description: 'Normal Package plus Finance.',
    modules: [...NORMAL_MODULES, 'Finance'],
    roleAccess: {
      admin: 'Everything in package except Library.',
      teacher: 'Full teaching modules and reports.',
      student: 'Full student learning modules and reports.',
      finance: 'Full package access including Finance.',
    },
  },
  {
    id: 'golden',
    name: 'Golden Package',
    description: 'Silver Package plus Library.',
    modules: [...NORMAL_MODULES, 'Finance', 'Library'],
    roleAccess: {
      admin: 'Full access including Finance and Library.',
      teacher: 'Full teaching modules and reports.',
      student: 'Full student learning modules and reports.',
      finance: 'Full package access including Finance.',
    },
  },
];

const DEFAULT_CURRENCY = 'MK';

@Injectable()
export class SchoolsService {
  constructor(
    @InjectRepository(School) private repo: Repository<School>,
    @InjectRepository(SchoolAdminCredentials) private credentialsRepo: Repository<SchoolAdminCredentials>,
    @InjectRepository(PackageCatalog) private packageCatalogRepo: Repository<PackageCatalog>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  private async ensurePackageCatalogSeeded() {
    const existing = await this.packageCatalogRepo.find();
    const byPackageId = new Map(existing.map((pkg) => [pkg.packageId, pkg]));

    const missing = BASE_CATALOG.filter((pkg) => !byPackageId.has(pkg.id));
    if (missing.length === 0) return;

    const rows = missing.map((pkg) =>
      this.packageCatalogRepo.create({
        packageId: pkg.id,
        name: pkg.name,
        description: pkg.description,
        modules: pkg.modules,
        roleAccess: pkg.roleAccess,
        price: DEFAULT_PRICING[pkg.id],
        currency: DEFAULT_CURRENCY,
        isActive: true,
      }),
    );

    await this.packageCatalogRepo.save(rows);
  }

  private async getCatalogRows() {
    await this.ensurePackageCatalogSeeded();
    return this.packageCatalogRepo.find({ where: { isActive: true }, order: { createdAt: 'ASC' } });
  }

  private buildPricingFromRows(rows: PackageCatalog[]): PackagePricing {
    const mapById = new Map(rows.map((row) => [row.packageId, Number(row.price)]));
    return {
      normal: mapById.get('normal') ?? DEFAULT_PRICING.normal,
      silver: mapById.get('silver') ?? DEFAULT_PRICING.silver,
      golden: mapById.get('golden') ?? DEFAULT_PRICING.golden,
    };
  }

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
      const finalUsername = await this.generateUniqueUsername(adminRepo, username);

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

      // Auto-provision principal account using the same setup approach as admin.
      const principalCredentialsSeed = this.generatePrincipalCredentials(school.name, school.code);
      const finalPrincipalUsername = await this.generateUniqueUsername(adminRepo, principalCredentialsSeed.username);
      const principalHashed = await bcrypt.hash(principalCredentialsSeed.password, 10);
      const principalUser = adminRepo.create({
        username: finalPrincipalUsername,
        email: principalCredentialsSeed.email,
        password: principalHashed,
        role: Role.PRINCIPAL,
        schoolId: school.id,
        isActive: true,
        forcePasswordReset: true,
      });
      await adminRepo.save(principalUser);

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
        principal: {
          id: principalUser.id,
          username: finalPrincipalUsername,
          email: principalUser.email,
          tempPassword: principalCredentialsSeed.displayPassword,
          forcePasswordReset: true,
        },
        seeded: !!dto.seedDefaults,
        finalUsername,
        email,
        finalPrincipalUsername,
        principalEmail: principalUser.email,
      };
    });

    // Create notification AFTER the transaction is committed
    try {
      console.log(`🔔 Creating notification for school: ${result.school.name} (${result.school.id})`);
      const notification = await this.notificationService.create({
        title: 'New School Created',
        message: `School "${result.school.name}" (${result.school.code}) has been successfully created with admin and principal accounts`,
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.HIGH,
        schoolId: result.school.id,
        targetRoles: ['ADMIN', 'PRINCIPAL'],
        metadata: {
          schoolId: result.school.id,
          schoolName: result.school.name,
          schoolCode: result.school.code,
          adminUsername: result.finalUsername,
          adminEmail: result.email,
          principalUsername: result.finalPrincipalUsername,
          principalEmail: result.principalEmail,
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
      principal: {
        id: result.principal.id,
        username: result.finalPrincipalUsername,
        email: result.principal.email,
        tempPassword: result.principal.tempPassword,
        forcePasswordReset: true,
      },
      adminCredentials: {
        username: result.finalUsername,
        email: result.admin.email,
        password: result.admin.tempPassword,
      },
      principalCredentials: {
        username: result.finalPrincipalUsername,
        email: result.principal.email,
        password: result.principal.tempPassword,
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
          targetRoles: ['ADMIN'],
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

  private extractPricingFromMetadata(metadata?: Record<string, any>): PackagePricing {
    const candidate = metadata?.packagePricing;
    return {
      normal: Number(candidate?.normal) || DEFAULT_PRICING.normal,
      silver: Number(candidate?.silver) || DEFAULT_PRICING.silver,
      golden: Number(candidate?.golden) || DEFAULT_PRICING.golden,
    };
  }

  private extractAssignedPackage(metadata?: Record<string, any>): PackageId {
    const raw = metadata?.assignedPackage;
    if (raw === 'silver' || raw === 'golden' || raw === 'normal') {
      return raw;
    }
    return 'normal';
  }

  private buildCatalog(rows: PackageCatalog[]): PackageCatalogItem[] {
    return rows.map((row) => ({
      id: row.packageId,
      name: row.name,
      description: row.description,
      modules: row.modules,
      roleAccess: row.roleAccess,
      price: Number(row.price),
    }));
  }

  async getPackageCatalog() {
    const rows = await this.getCatalogRows();
    const pricing = this.buildPricingFromRows(rows);
    return {
      currency: DEFAULT_CURRENCY,
      pricing,
      packages: this.buildCatalog(rows),
    };
  }

  async getSchoolPackageConfig(schoolId: string) {
    const school = await this.findOne(schoolId);
    const rows = await this.getCatalogRows();
    const pricing = this.buildPricingFromRows(rows);
    const assignedPackage = this.extractAssignedPackage(school.metadata);

    return {
      schoolId: school.id,
      schoolName: school.name,
      assignedPackage,
      currency: DEFAULT_CURRENCY,
      pricing,
      packages: this.buildCatalog(rows),
    };
  }

  async assignPackageToSchool(schoolId: string, packageId: PackageId) {
    if (!['normal', 'silver', 'golden'].includes(packageId)) {
      throw new BadRequestException('Invalid package id');
    }
    const school = await this.findOne(schoolId);
    const nextMetadata = {
      ...(school.metadata || {}),
      assignedPackage: packageId,
    };
    await this.update(schoolId, { metadata: nextMetadata });
    return this.getSchoolPackageConfig(schoolId);
  }

  async updatePackagePricing(pricingUpdate: Partial<PackagePricing>) {
    const rows = await this.getCatalogRows();
    const currentPricing = this.buildPricingFromRows(rows);
    const nextPricing: PackagePricing = {
      normal: Number(pricingUpdate.normal ?? currentPricing.normal),
      silver: Number(pricingUpdate.silver ?? currentPricing.silver),
      golden: Number(pricingUpdate.golden ?? currentPricing.golden),
    };

    if (
      !Number.isFinite(nextPricing.normal) || nextPricing.normal < 0 ||
      !Number.isFinite(nextPricing.silver) || nextPricing.silver < 0 ||
      !Number.isFinite(nextPricing.golden) || nextPricing.golden < 0
    ) {
      throw new BadRequestException('Invalid package prices');
    }

    const rowsById = new Map(rows.map((row) => [row.packageId, row]));
    for (const packageId of ['normal', 'silver', 'golden'] as PackageId[]) {
      const row = rowsById.get(packageId);
      if (!row) continue;
      row.price = nextPricing[packageId];
    }
    await this.packageCatalogRepo.save(Array.from(rowsById.values()));

    // Keep school metadata pricing in sync for compatibility with existing billing logic.
    const schools = await this.repo.find();
    for (const school of schools) {
      school.metadata = {
        ...(school.metadata || {}),
        packagePricing: nextPricing,
      };
    }
    await this.repo.save(schools);

    const refreshedRows = await this.getCatalogRows();
    return {
      currency: DEFAULT_CURRENCY,
      pricing: nextPricing,
      packages: this.buildCatalog(refreshedRows),
    };
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
        targetRoles: ['ADMIN'],
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
        targetRoles: ['ADMIN'],
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

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  async removeSchoolWithAssociatedData(id: string) {
    const school = await this.findOne(id);

    return this.dataSource.transaction(async (manager) => {
      // Delete from all school-scoped tables first to avoid FK violations when deleting the school.
      const schoolScopedTables: Array<{ table_name: string }> = await manager.query(
        `
          SELECT DISTINCT c.table_name
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.column_name = 'schoolId'
            AND c.table_name <> 'schools'
        `,
      );

      for (const row of schoolScopedTables) {
        const tableName = row.table_name;
        const quotedTable = this.quoteIdentifier(tableName);
        await manager.query(`DELETE FROM ${quotedTable} WHERE "schoolId" = $1`, [id]);
      }

      const deleteResult = await manager.delete(School, { id });
      if (!deleteResult.affected) {
        throw new NotFoundException('School not found');
      }

      return {
        success: true,
        message: `School \"${school.name}\" and associated school-scoped data deleted successfully`,
        schoolId: id,
      };
    });
  }

  private async generateUniqueUsername(userRepo: Repository<User>, baseUsername: string): Promise<string> {
    let candidate = baseUsername;
    let counter = 1;
    while (await userRepo.findOne({ where: { username: candidate } })) {
      candidate = `${baseUsername}${counter}`;
      counter++;
    }
    return candidate;
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

  private generatePrincipalCredentials(name: string, code: string) {
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedCode = cleanCode || 'school';
    const username = `${normalizedCode}principal`;
    const email = `principal@${cleanCode}.com`;

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
