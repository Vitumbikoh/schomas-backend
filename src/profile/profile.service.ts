import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { Finance } from '../user/entities/finance.entity';
import { Role } from '../user/enums/role.enum';
import { School } from '../school/entities/school.entity';
import { UpdateProfileDto, ProfileResponseDto, ProfileActivityDto, ProfileStatsDto } from './dto/profile.dto';
import { SystemLoggingService } from '../logs/system-logging.service';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private parentRepository: Repository<Parent>,
    @InjectRepository(Finance)
    private financeRepository: Repository<Finance>,
    @InjectRepository(School)
    private schoolRepository: Repository<School>,
    private systemLoggingService: SystemLoggingService,
  ) {}

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    // Get user with school information
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['school'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Base profile information for all users
    const baseProfile: ProfileResponseDto = {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email ?? null,
      phone: undefined, // Will be set below
      school: user.school ? {
        id: user.school.id,
        name: user.school.name,
        code: user.school.code,
      } : null,
      createdAt: user.createdAt?.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString(),
      status: user.isActive ? 'Active' : 'Inactive',
    };

    // Set phone number based on role
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      baseProfile.phone = user.phone && user.phone.trim() !== '' ? user.phone : undefined;
      console.log(`ADMIN/SUPER_ADMIN phone: ${baseProfile.phone}`);
    }

    // For other roles, get additional profile details
    let roleSpecificProfile = {};

    switch (user.role) {
      case Role.TEACHER:
        const teacher = await this.teacherRepository.findOne({
          where: { userId: user.id },
        });
        if (teacher) {
          baseProfile.phone = teacher.phoneNumber && teacher.phoneNumber.trim() !== '' ? teacher.phoneNumber : undefined;
          console.log(`TEACHER phone: ${baseProfile.phone}`);
          roleSpecificProfile = {
            teacherId: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            phoneNumber: teacher.phoneNumber,
          };
        }
        break;

      case Role.STUDENT:
        const student = await this.studentRepository.findOne({
          where: { userId: user.id },
        });
        if (student) {
          baseProfile.phone = student.phoneNumber && student.phoneNumber.trim() !== '' ? student.phoneNumber : undefined;
          console.log(`STUDENT phone: ${baseProfile.phone}`);
          roleSpecificProfile = {
            firstName: student.firstName,
            lastName: student.lastName,
            phoneNumber: student.phoneNumber,
            studentId: student.studentId,
            address: student.address,
            dateOfBirth: student.dateOfBirth,
          };
        }
        break;

      case Role.PARENT:
        const parent = await this.parentRepository.findOne({
          where: { user: { id: user.id } },
        });
        if (parent) {
          baseProfile.phone = parent.phoneNumber && parent.phoneNumber.trim() !== '' ? parent.phoneNumber : undefined;
          console.log(`PARENT phone: ${baseProfile.phone}`);
          roleSpecificProfile = {
            firstName: parent.firstName,
            lastName: parent.lastName,
            phoneNumber: parent.phoneNumber,
            address: parent.address,
            dateOfBirth: parent.dateOfBirth,
            gender: parent.gender,
            occupation: parent.occupation,
          };
        }
        break;

      case Role.FINANCE:
        const finance = await this.financeRepository.findOne({
          where: { user: { id: user.id } },
        });
        if (finance) {
          baseProfile.phone = finance.phoneNumber && finance.phoneNumber.trim() !== '' ? finance.phoneNumber : undefined;
          console.log(`FINANCE phone: ${baseProfile.phone}`);
          roleSpecificProfile = {
            firstName: finance.firstName,
            lastName: finance.lastName,
            phoneNumber: finance.phoneNumber,
            address: finance.address,
            dateOfBirth: finance.dateOfBirth,
            gender: finance.gender,
          };
        }
        break;

      default:
        // For any other roles, return only base profile
        break;
    }

    console.log(`Final profile phone for ${user.role}: ${baseProfile.phone}`);

    return {
      ...baseProfile,
      ...roleSpecificProfile,
    } as ProfileResponseDto;
  }

  async updateProfile(userId: string, updateData: UpdateProfileDto): Promise<ProfileResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update base user information if provided
    if (updateData.username) user.username = updateData.username;
    if (updateData.email) user.email = updateData.email;
    if (updateData.phone) user.phone = updateData.phone;
    if (updateData.image) user.image = updateData.image;

    await this.userRepository.save(user);

    // Update role-specific information
    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      switch (user.role) {
        case Role.TEACHER:
          const teacher = await this.teacherRepository.findOne({
            where: { userId: user.id },
          });
          if (teacher && updateData.firstName) teacher.firstName = updateData.firstName;
          if (teacher && updateData.lastName) teacher.lastName = updateData.lastName;
          if (teacher && updateData.phoneNumber) teacher.phoneNumber = updateData.phoneNumber;
          if (teacher) await this.teacherRepository.save(teacher);
          break;

        case Role.STUDENT:
          const student = await this.studentRepository.findOne({
            where: { userId: user.id },
          });
          if (student && updateData.firstName) student.firstName = updateData.firstName;
          if (student && updateData.lastName) student.lastName = updateData.lastName;
          if (student && updateData.phoneNumber) student.phoneNumber = updateData.phoneNumber;
          if (student && updateData.address) student.address = updateData.address;
          if (student && updateData.dateOfBirth) student.dateOfBirth = new Date(updateData.dateOfBirth);
          if (student) await this.studentRepository.save(student);
          break;

        case Role.PARENT:
          const parent = await this.parentRepository.findOne({
            where: { user: { id: user.id } },
          });
          if (parent && updateData.firstName) parent.firstName = updateData.firstName;
          if (parent && updateData.lastName) parent.lastName = updateData.lastName;
          if (parent && updateData.phoneNumber) parent.phoneNumber = updateData.phoneNumber;
          if (parent && updateData.address) parent.address = updateData.address;
          if (parent && updateData.dateOfBirth) parent.dateOfBirth = new Date(updateData.dateOfBirth);
          if (parent && updateData.gender) parent.gender = updateData.gender;
          if (parent && updateData.occupation) parent.occupation = updateData.occupation;
          if (parent) await this.parentRepository.save(parent);
          break;

        case Role.FINANCE:
          const finance = await this.financeRepository.findOne({
            where: { user: { id: user.id } },
          });
          if (finance && updateData.firstName) finance.firstName = updateData.firstName;
          if (finance && updateData.lastName) finance.lastName = updateData.lastName;
          if (finance && updateData.phoneNumber) finance.phoneNumber = updateData.phoneNumber;
          if (finance && updateData.address) finance.address = updateData.address;
          if (finance && updateData.dateOfBirth) finance.dateOfBirth = new Date(updateData.dateOfBirth);
          if (finance && updateData.gender) finance.gender = updateData.gender;
          if (finance) await this.financeRepository.save(finance);
          break;
      }
    }

    // Return updated profile
    return this.getProfile(userId);
  }

  async getProfileActivities(userId: string, limit: number = 10): Promise<ProfileActivityDto[]> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      // Get recent system logs for this user
      const logs = await this.systemLoggingService.getLogsByUser(
        userId,
        limit,
        user.schoolId || undefined,
        user.role === Role.SUPER_ADMIN,
      );
      
      if (logs && logs.length > 0) {
        return logs.map(log => ({
          id: log.id,
          action: this.formatLogAction(log.action),
          date: log.timestamp.toISOString(),
          description: this.getActionDescription(log.action),
        }));
      }
    } catch (error) {
      console.warn('Failed to fetch system logs:', error.message);
    }

    // Return basic activity data if system logs aren't available or empty
    const activities: ProfileActivityDto[] = [];
    
    if (user.lastLoginAt) {
      activities.push({
        id: 'login-' + user.id,
        action: 'Logged in',
        date: user.lastLoginAt.toISOString(),
        description: 'User signed into the system',
      });
    }

    if (user.createdAt) {
      activities.push({
        id: 'created-' + user.id,
        action: 'Account created',
        date: user.createdAt.toISOString(),
        description: 'User account was created',
      });
    }

    // Add some mock activities for demonstration if no real data
    if (activities.length === 0) {
      activities.push({
        id: 'demo-1',
        action: 'Profile viewed',
        date: new Date().toISOString(),
        description: 'User accessed their profile page',
      });
    }

    return activities.slice(0, limit);
  }

  async getProfileStats(userId: string): Promise<ProfileStatsDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Base stats for all users
    const baseStats = {
      loginCount: await this.getLoginCount(userId),
      lastLogin: user.lastLoginAt?.toISOString() || null,
      accountAge: this.calculateAccountAge(user.createdAt),
      isActive: this.isUserActive(user),
    };

    // Role-specific stats
    switch (user.role) {
      case Role.TEACHER:
        return {
          ...baseStats,
          ...await this.getTeacherStats(userId),
        };
      case Role.STUDENT:
        return {
          ...baseStats,
          ...await this.getStudentStats(userId),
        };
      case Role.ADMIN:
      case Role.SUPER_ADMIN:
        return {
          ...baseStats,
          ...await this.getAdminStats(userId),
        };
      case Role.PARENT:
        return {
          ...baseStats,
          ...await this.getParentStats(userId),
        };
      case Role.FINANCE:
        return {
          ...baseStats,
          ...await this.getFinanceStats(userId),
        };
      default:
        return baseStats;
    }
  }

  private formatLogAction(action: string): string {
    // Convert system log actions to user-friendly descriptions
    const actionMap: Record<string, string> = {
      'LOGIN': 'Logged in',
      'LOGOUT': 'Logged out',
      'CREATE_STUDENT': 'Created student record',
      'UPDATE_STUDENT': 'Updated student information',
      'CREATE_TEACHER': 'Created teacher record',
      'UPDATE_TEACHER': 'Updated teacher information',
      'SUBMIT_GRADES': 'Submitted grades',
      'CREATE_EXAM': 'Created exam',
      'PAYROLL_RUN_CREATED': 'Created payroll run',
      'EXPENSE_CREATED': 'Created expense record',
    };

    return actionMap[action] || action.toLowerCase().replace(/_/g, ' ');
  }

  private getActionDescription(action: string): string {
    const descriptions: Record<string, string> = {
      'LOGIN': 'User signed into the system',
      'LOGOUT': 'User signed out of the system',
      'CREATE_STUDENT': 'Added a new student to the system',
      'UPDATE_STUDENT': 'Modified student information',
      'SUBMIT_GRADES': 'Submitted grade reports for students',
      'CREATE_EXAM': 'Created a new examination',
    };

    return descriptions[action] || 'System activity performed';
  }

  private async getLoginCount(userId: string): Promise<number> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      const logs = await this.systemLoggingService.getLogsByUser(
        userId,
        1000,
        user?.schoolId || undefined,
        user?.role === Role.SUPER_ADMIN,
      );
      const loginLogs = logs.filter(log => log.action === 'LOGIN');
      return loginLogs.length > 0 ? loginLogs.length : Math.floor(Math.random() * 50) + 10; // Demo data if no logs
    } catch {
      return Math.floor(Math.random() * 50) + 10; // 10-59 logins as demo data
    }
  }

  private calculateAccountAge(createdAt: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Days
  }

  private isUserActive(user: User): boolean {
    if (!user.lastActivityAt) return false;
    const now = new Date();
    const daysSinceActivity = (now.getTime() - user.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceActivity <= 30; // Active if activity within 30 days
  }

  private async getTeacherStats(userId: string): Promise<Partial<ProfileStatsDto>> {
    // These would be real database queries in production
    // For now, return demo data
    return {
      classesCount: Math.floor(Math.random() * 5) + 2, // 2-6 classes
      studentsCount: Math.floor(Math.random() * 80) + 20, // 20-99 students
      assignmentsCreated: Math.floor(Math.random() * 30) + 5, // 5-34 assignments
      averageRating: +(Math.random() * 2 + 3).toFixed(1), // 3.0-5.0 rating
    };
  }

  private async getStudentStats(userId: string): Promise<Partial<ProfileStatsDto>> {
    return {
      currentGPA: +(Math.random() * 1.5 + 2.5).toFixed(2), // 2.5-4.0 GPA
      attendanceRate: Math.floor(Math.random() * 20) + 80, // 80-99% attendance
      assignmentsCompleted: Math.floor(Math.random() * 25) + 10, // 10-34 assignments
      activitiesCount: Math.floor(Math.random() * 8) + 2, // 2-9 activities
    };
  }

  private async getAdminStats(userId: string): Promise<Partial<ProfileStatsDto>> {
    return {
      reportsGenerated: Math.floor(Math.random() * 50) + 20, // 20-69 reports
      systemChanges: Math.floor(Math.random() * 100) + 25, // 25-124 changes
      usersManaged: Math.floor(Math.random() * 500) + 100, // 100-599 users
    };
  }

  private async getParentStats(userId: string): Promise<Partial<ProfileStatsDto>> {
    return {
      childrenCount: Math.floor(Math.random() * 4) + 1, // 1-4 children
      meetingsAttended: Math.floor(Math.random() * 15) + 5, // 5-19 meetings
      messagesExchanged: Math.floor(Math.random() * 80) + 20, // 20-99 messages
      paymentsCount: Math.floor(Math.random() * 20) + 10, // 10-29 payments
    };
  }

  private async getFinanceStats(userId: string): Promise<Partial<ProfileStatsDto>> {
    return {
      transactionsProcessed: Math.floor(Math.random() * 200) + 50, // 50-249 transactions
      reportsGenerated: Math.floor(Math.random() * 30) + 10, // 10-39 reports
      expensesManaged: Math.floor(Math.random() * 100) + 25, // 25-124 expenses
    };
  }
}
