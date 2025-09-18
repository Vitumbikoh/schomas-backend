import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Finance } from '../user/entities/finance.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UsersService } from '../user/user.service';
import { SystemLoggingService } from '../logs/system-logging.service';
import { Role } from '../user/enums/role.enum';

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  joinDate: string;
  status: string;
  lastLogin?: string;
  salary?: number;
  subjects?: string[];
  avatar?: string;
  specializations?: string[];
  qualifications?: string;
  yearsOfExperience?: number;
  canApproveBudgets?: boolean;
  canProcessPayments?: boolean;
}

export interface StaffStats {
  total: number;
  active: number;
  teachers: number;
  admins: number;
  finance: number;
  librarians: number;
  newThisMonth: number;
  totalSalary: number;
}

export interface PaginatedStaffResponse {
  staff: StaffMember[];
  totalPages: number;
  totalItems: number;
  currentPage: number;
  itemsPerPage: number;
  stats: StaffStats;
}

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Finance)
    private financeRepository: Repository<Finance>,
    private usersService: UsersService,
    private systemLoggingService: SystemLoggingService,
  ) {}

  async getAllStaff(schoolId: string, filters: {
    page: number;
    limit: number;
    search?: string;
    role?: string;
    status?: string;
  }): Promise<PaginatedStaffResponse> {
    const { page, limit, search, role, status } = filters;
    const offset = (page - 1) * limit;

    // Base where conditions
    const whereConditions: any = {
      schoolId,
      role: In([Role.ADMIN, Role.TEACHER, Role.FINANCE, Role.LIBRARIAN]),
    };

    // Add search conditions
    if (search) {
      whereConditions.OR = [
        { firstName: Like(`%${search}%`) },
        { lastName: Like(`%${search}%`) },
        { email: Like(`%${search}%`) },
      ];
    }

    // Add role filter
    if (role && role !== 'all') {
      whereConditions.role = role.toUpperCase();
    }

    // Add status filter
    if (status && status !== 'all') {
      if (status === 'active') {
        whereConditions.isActive = true;
      } else if (status === 'inactive') {
        whereConditions.isActive = false;
      }
    }

    // Get users with staff roles
    const [users, totalItems] = await this.userRepository.findAndCount({
      where: whereConditions,
      relations: ['teacher', 'finance'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    // Transform users to staff members
    const staff = await Promise.all(
      users.map(user => this.transformUserToStaffMember(user))
    );

    // Get stats
    const stats = await this.getStaffStats(schoolId);

    return {
      staff,
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
      currentPage: page,
      itemsPerPage: limit,
      stats,
    };
  }

  async getStaffStats(schoolId: string): Promise<StaffStats> {
    const staffUsers = await this.userRepository.find({
      where: {
        schoolId,
        role: In([Role.ADMIN, Role.TEACHER, Role.FINANCE, Role.LIBRARIAN]),
      },
      relations: ['teacher', 'finance'],
    });

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const stats: StaffStats = {
      total: staffUsers.length,
      active: staffUsers.filter(user => user.isActive).length,
      teachers: staffUsers.filter(user => user.role === Role.TEACHER).length,
      admins: staffUsers.filter(user => user.role === Role.ADMIN).length,
      finance: staffUsers.filter(user => user.role === Role.FINANCE).length,
      librarians: staffUsers.filter(user => user.role === Role.LIBRARIAN).length,
      newThisMonth: staffUsers.filter(user => 
        user.createdAt && new Date(user.createdAt) > oneMonthAgo
      ).length,
      totalSalary: 0, // We'll calculate this if salary data is available
    };

    return stats;
  }

  async getStaffById(id: string, schoolId: string): Promise<StaffMember> {
    const user = await this.userRepository.findOne({
      where: { 
        id, 
        schoolId,
        role: In([Role.ADMIN, Role.TEACHER, Role.FINANCE, Role.LIBRARIAN]),
      },
      relations: ['teacher', 'finance'],
    });

    if (!user) {
      throw new NotFoundException('Staff member not found');
    }

    return this.transformUserToStaffMember(user);
  }

  async createStaff(createStaffDto: CreateStaffDto, schoolId: string, currentUser: any): Promise<StaffMember> {
    try {
      let result;

      switch (createStaffDto.role.toLowerCase()) {
        case 'teacher':
          result = await this.usersService.createTeacher({
            username: createStaffDto.username,
            email: createStaffDto.email,
            password: createStaffDto.password,
            firstName: createStaffDto.firstName,
            lastName: createStaffDto.lastName,
            phoneNumber: createStaffDto.phoneNumber,
            address: createStaffDto.address,
            dateOfBirth: createStaffDto.dateOfBirth ? new Date(createStaffDto.dateOfBirth) : undefined,
            gender: createStaffDto.gender,
            qualification: createStaffDto.qualification || '',
            subjectSpecialization: createStaffDto.subjectSpecialization || '',
            yearsOfExperience: createStaffDto.yearsOfExperience || 0,
            hireDate: createStaffDto.hireDate ? new Date(createStaffDto.hireDate) : new Date(),
          }, schoolId);
          break;

        case 'finance':
          result = await this.usersService.createFinance({
            username: createStaffDto.username,
            email: createStaffDto.email,
            password: createStaffDto.password,
            firstName: createStaffDto.firstName,
            lastName: createStaffDto.lastName,
            phoneNumber: createStaffDto.phoneNumber,
            address: createStaffDto.address,
            dateOfBirth: createStaffDto.dateOfBirth ? new Date(createStaffDto.dateOfBirth) : undefined,
            gender: createStaffDto.gender,
            department: createStaffDto.department || 'Finance',
            canApproveBudgets: createStaffDto.canApproveBudgets || false,
            canProcessPayments: createStaffDto.canProcessPayments !== false,
          }, schoolId);
          break;

        case 'admin':
        case 'librarian':
          result = await this.usersService.createUser({
            username: createStaffDto.username,
            email: createStaffDto.email,
            password: createStaffDto.password,
            role: createStaffDto.role.toUpperCase() as Role,
            schoolId,
          });
          break;

        default:
          throw new BadRequestException('Invalid role specified');
      }

      // Log staff creation
      await this.systemLoggingService.logAction({
        action: 'create_staff_member',
        module: 'staff',
        level: 'info',
        performedBy: {
          id: currentUser?.sub,
          email: currentUser?.email || 'unknown',
          role: currentUser?.role || 'admin',
          name: currentUser?.name || 'Admin User'
        },
        entityId: result.id,
        entityType: 'Staff',
        newValues: {
          staffId: result.id,
          role: createStaffDto.role,
          firstName: createStaffDto.firstName,
          lastName: createStaffDto.lastName,
          email: result.email || createStaffDto.email,
        },
        metadata: {
          created_by_admin: currentUser?.email || 'unknown',
          creation_timestamp: new Date().toISOString(),
          staff_full_name: `${createStaffDto.firstName} ${createStaffDto.lastName}`,
          role: createStaffDto.role,
        }
      });

      return this.transformUserToStaffMember(result);
    } catch (error) {
      // Log error
      await this.systemLoggingService.logAction({
        action: 'create_staff_member_error',
        module: 'staff',
        level: 'error',
        performedBy: {
          id: currentUser?.sub,
          email: currentUser?.email || 'unknown',
          role: currentUser?.role || 'admin'
        },
        entityType: 'Staff',
        errorMessage: error.message,
        stackTrace: error.stack,
        metadata: {
          attempted_staff_email: createStaffDto.email,
          attempted_role: createStaffDto.role,
          attempted_by_admin: currentUser?.email || 'unknown',
          error_timestamp: new Date().toISOString()
        }
      });

      throw error;
    }
  }

  async updateStaff(id: string, updateStaffDto: UpdateStaffDto, currentUser: any): Promise<StaffMember> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['teacher', 'finance'],
    });

    if (!user) {
      throw new NotFoundException('Staff member not found');
    }

    // Update user basic info
    Object.assign(user, updateStaffDto);
    await this.userRepository.save(user);

    // Update role-specific info
    if (user.role === Role.TEACHER && user.teacher && updateStaffDto.subjects) {
      // Update teacher-specific fields
      Object.assign(user.teacher, {
        subjectSpecialization: updateStaffDto.subjects?.join(', '),
        salary: updateStaffDto.salary,
        yearsOfExperience: updateStaffDto.yearsOfExperience,
      });
      await this.teacherRepository.save(user.teacher);
    } else if (user.role === Role.FINANCE && user.finance) {
      // Update finance-specific fields
      Object.assign(user.finance, {
        department: updateStaffDto.department,
        canApproveBudgets: updateStaffDto.canApproveBudgets,
        canProcessPayments: updateStaffDto.canProcessPayments,
        salary: updateStaffDto.salary,
      });
      await this.financeRepository.save(user.finance);
    }

    // Log update
    await this.systemLoggingService.logAction({
      action: 'update_staff_member',
      module: 'staff',
      level: 'info',
      performedBy: {
        id: currentUser?.sub,
        email: currentUser?.email || 'unknown',
        role: currentUser?.role || 'admin'
      },
      entityId: id,
      entityType: 'Staff',
      newValues: updateStaffDto,
      metadata: {
        updated_by_admin: currentUser?.email || 'unknown',
        update_timestamp: new Date().toISOString(),
      }
    });

    return this.transformUserToStaffMember(user);
  }

  async updateStaffStatus(id: string, status: 'active' | 'inactive' | 'suspended', currentUser: any): Promise<StaffMember> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['teacher', 'finance'],
    });

    if (!user) {
      throw new NotFoundException('Staff member not found');
    }

    const oldStatus = user.isActive;
    if (status === 'active') {
      user.isActive = true;
    } else if (status === 'inactive' || status === 'suspended') {
      user.isActive = false;
    }
    await this.userRepository.save(user);

    // Log status change
    await this.systemLoggingService.logAction({
      action: 'update_staff_status',
      module: 'staff',
      level: 'info',
      performedBy: {
        id: currentUser?.sub,
        email: currentUser?.email || 'unknown',
        role: currentUser?.role || 'admin'
      },
      entityId: id,
      entityType: 'Staff',
      oldValues: { status: oldStatus },
      newValues: { status },
      metadata: {
        updated_by_admin: currentUser?.email || 'unknown',
        update_timestamp: new Date().toISOString(),
      }
    });

    return this.transformUserToStaffMember(user);
  }

  async deleteStaff(id: string, currentUser: any): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['teacher', 'finance'],
    });

    if (!user) {
      throw new NotFoundException('Staff member not found');
    }

    const staffInfo = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    await this.userRepository.remove(user);

    // Log deletion
    await this.systemLoggingService.logAction({
      action: 'delete_staff_member',
      module: 'staff',
      level: 'info',
      performedBy: {
        id: currentUser?.sub,
        email: currentUser?.email || 'unknown',
        role: currentUser?.role || 'admin'
      },
      entityId: id,
      entityType: 'Staff',
      oldValues: staffInfo,
      metadata: {
        deleted_by_admin: currentUser?.email || 'unknown',
        deletion_timestamp: new Date().toISOString(),
      }
    });

    return { message: 'Staff member deleted successfully' };
  }

  private async transformUserToStaffMember(user: any): Promise<StaffMember> {
    let firstName = '';
    let lastName = '';
    let department = this.getDepartmentByRole(user.role);
    let joinDate = user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : '';
    let salary: number | undefined;
    let subjects: string[] | undefined;
    let qualifications: string | undefined;
    let yearsOfExperience: number | undefined;
    let canApproveBudgets: boolean | undefined;
    let canProcessPayments: boolean | undefined;

    // Get name and role-specific data from related entities
    if (user.teacher) {
      firstName = user.teacher.firstName || '';
      lastName = user.teacher.lastName || '';
      department = 'Teaching';
      subjects = user.teacher.subjectSpecialization 
        ? user.teacher.subjectSpecialization.split(',').map(s => s.trim())
        : [];
      qualifications = user.teacher.qualification;
      yearsOfExperience = user.teacher.yearsOfExperience;
      joinDate = user.teacher.hireDate 
        ? new Date(user.teacher.hireDate).toISOString().split('T')[0]
        : joinDate;
    } else if (user.finance) {
      firstName = user.finance.firstName || '';
      lastName = user.finance.lastName || '';
      department = user.finance.department || 'Finance';
      canApproveBudgets = user.finance.canApproveBudgets;
      canProcessPayments = user.finance.canProcessPayments;
    }

    const staffMember: StaffMember = {
      id: user.id,
      firstName,
      lastName,
      email: user.email || '',
      phone: user.phone || user.teacher?.phoneNumber || user.finance?.phoneNumber || '',
      role: user.role.toLowerCase(),
      department,
      joinDate,
      status: user.isActive ? 'active' : 'inactive',
      avatar: user.image || undefined,
      salary,
      subjects,
      qualifications,
      yearsOfExperience,
      canApproveBudgets,
      canProcessPayments,
    };

    return staffMember;
  }

  private getDepartmentByRole(role: string): string {
    switch (role) {
      case Role.TEACHER:
        return 'Teaching';
      case Role.ADMIN:
        return 'Administration';
      case Role.FINANCE:
        return 'Finance';
      case Role.LIBRARIAN:
        return 'Library';
      default:
        return 'General';
    }
  }
}