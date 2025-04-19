import { Controller, Get, Request, UseGuards, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { CourseService } from '../course/course.service';
import { MoreThanOrEqual } from 'typeorm';
import { StudentsService } from 'src/student/student.service';
import { TeachersService } from 'src/teacher/teacher.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/user/enums/role.enum';

@Controller('dashboard/admin')
export class AdminDashboardController {
  private readonly logger = new Logger(AdminDashboardController.name);

  constructor(
    private readonly studentService: StudentsService,
    private readonly courseService: CourseService,
    private readonly teacherService: TeachersService,
  ) {}

  @Get('dashboard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.FINANCE, Role.TEACHER)
  async getAdminDashboard(@Request() req) {
    try {
      // Validate user
      if (!req.user?.role) {
        this.logger.warn('Invalid user data received');
        throw new UnauthorizedException('Invalid user data');
      }

      this.logger.log(`Fetching dashboard for ${req.user.role} user ${req.user.id}`);

      // Process features
      const availableFeatures = this.getAvailableFeatures(req.user.role);
      
      // Get stats with error handling
      const stats = await this.getAdminStatsSafe(req.user.role, req.user.id);
      
      // Get UI config
      const uiConfig = this.getUIConfigForRole(req.user.role);

      return {
        user: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
        },
        features: availableFeatures,
        stats,
        uiConfig,
      };
    } catch (error) {
      this.logger.error('Dashboard error:', error.stack);
      throw new InternalServerErrorException('Failed to load dashboard data');
    }
  }

  private getAvailableFeatures(role: Role): string[] {
    const featureMatrix = {
      studentManagement: [Role.ADMIN],
      courseManagement: [Role.ADMIN, Role.TEACHER],
      teacherManagement: [Role.ADMIN],
      financeManagement: [Role.ADMIN, Role.FINANCE],
      examGrades: [Role.ADMIN, Role.TEACHER],
      attendanceTracking: [Role.ADMIN, Role.TEACHER],
      timetableScheduling: [Role.ADMIN],
      parentTeacherPortal: [Role.ADMIN, Role.TEACHER],
      elearningIntegration: [Role.ADMIN],
      communicationSystem: [Role.ADMIN],
      libraryManagement: [Role.ADMIN],
      userManagement: [Role.ADMIN],
      systemSettings: [Role.ADMIN],
      financialReports: [Role.ADMIN, Role.FINANCE],
    };

    return Object.entries(featureMatrix)
      .filter(([_, roles]) => roles.includes(role))
      .map(([feature]) => feature);
  }

  private async getAdminStatsSafe(role: Role, userId?: number): Promise<any> {
    try {
      const [
        totalStudents,
        activeTeachers,
        newRegistrations,
        totalCourses,
        activeCourses,
        totalRevenue,
        pendingPayments,
        overdueInvoices,
        collectionRate,
        myStudents,
        upcomingClasses,
        assignmentsToGrade,
        studentAttendance,
      ] = await Promise.all([
        this.safeCount(() => this.studentService.count({})), 
        this.safeCount(() => this.teacherService.count({ status: 'active' })),
        this.safeCount(() => this.studentService.count({
          createdAt: MoreThanOrEqual(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        })),
        this.safeCount(() => this.courseService.count()),
        this.safeCount(() => this.courseService.count({ status: 'active' })),
        this.safeCall(() => this.getTotalRevenue()),
        this.safeCall(() => this.getPendingPayments()),
        this.safeCall(() => this.getOverdueInvoices()),
        this.safeCall(() => this.getCollectionRate()),
        this.safeCall(() => this.getMyStudentsCount(userId)),
        this.safeCall(() => this.getUpcomingClassesCount(userId)),
        this.safeCall(() => this.getAssignmentsToGradeCount(userId)),
        this.safeCall(() => this.getAverageStudentAttendance(userId)),
      ]);

      const baseStats = {
        [Role.ADMIN]: {
          totalStudents,
          activeTeachers,
          newRegistrations,
          systemHealth: await this.safeCall(() => this.calculateSystemHealth()),
          totalCourses,
          activeCourses,
        },
        [Role.FINANCE]: {
          totalRevenue,
          pendingPayments,
          overdueInvoices,
          collectionRate,
        },
        [Role.TEACHER]: {
          myStudents,
          upcomingClasses,
          assignmentsToGrade,
          studentAttendance,
        },
      };

      return baseStats[role] || {};
    } catch (error) {
      this.logger.error('Error getting admin stats:', error);
      return {};
    }
  }

  private async safeCount(countFn: () => Promise<number>): Promise<number> {
    try {
      return await countFn();
    } catch (error) {
      this.logger.warn(`Count operation failed: ${error.message}`);
      return 0;
    }
  }

  private async safeCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`Operation failed: ${error.message}`);
      // Return appropriate default based on expected return type
      if (typeof fn() === 'number') return 0 as T;
      if (typeof fn() === 'string') return '' as T;
      return undefined as unknown as T;
    }
  }


  private async calculateSystemHealth(): Promise<string> {
    // Placeholder: Implement actual system health logic here
    return '98%';
  }

  private async getTotalRevenue(): Promise<number> {
    // Placeholder: Implement actual revenue calculation
    return 125000;
  }

  private async getPendingPayments(): Promise<number> {
    // Placeholder: Implement actual pending payments calculation
    return 12450;
  }

  private async getOverdueInvoices(): Promise<number> {
    // Placeholder: Implement actual overdue invoices calculation
    return 15;
  }

  private async getCollectionRate(): Promise<string> {
    // Placeholder: Implement actual collection rate calculation
    return '92%';
  }

  private async getMyStudentsCount(userId?: number): Promise<number> {
    if (!userId) return 0;
    // Placeholder: Implement logic to count students for the teacher
    return 32;
  }

  private async getUpcomingClassesCount(userId?: number): Promise<number> {
    if (!userId) return 0;
    // Placeholder: Implement logic to count upcoming classes for the teacher
    return 5;
  }

  private async getAssignmentsToGradeCount(userId?: number): Promise<number> {
    if (!userId) return 0;
    // Placeholder: Implement logic to count assignments for the teacher
    return 12;
  }

  private async getAverageStudentAttendance(userId?: number): Promise<string> {
    if (!userId) return '0%';
    // Placeholder: Implement logic to calculate attendance for the teacher
    return '94%';
  }

  private getUIConfigForRole(role: Role) {
    const configs = {
      [Role.ADMIN]: {
        dashboardTitle: 'Administrator Dashboard',
        primaryColor: 'blue-800',
        showAllSections: true,
      },
      [Role.FINANCE]: {
        dashboardTitle: 'Finance Dashboard',
        primaryColor: 'green-700',
        showAllSections: false,
      },
      [Role.TEACHER]: {
        dashboardTitle: 'Teacher Dashboard',
        primaryColor: 'purple-700',
        showAllSections: false,
      },
    };
    return configs[role] || configs[Role.ADMIN];
  }
  
}