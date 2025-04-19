import {
  Controller,
  Get,
  Request,
  UseGuards,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/user/enums/role.enum';
import { StudentsService } from 'src/student/student.service';

@Controller('dashboard/student')
export class StudentDashboardController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('courses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.STUDENT, Role.PARENT)
async getStudentCourses(@Request() req) {
  if (!req.user || !req.user.role) {
    throw new UnauthorizedException('Invalid user data');
  }

  try {
    // For all roles, first find the student record associated with this user
    const student = await this.studentsService.findByUserId(req.user.id);
    
    if (!student) {
      throw new NotFoundException('Student record not found for this user');
    }

    return this.studentsService.getStudentCourses(student.id);
  } catch (err) {
    console.error('Error fetching courses:', err);
    throw err;
  }
}


  @Get('dashboard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.STUDENT, Role.PARENT)
  getStudentDashboard(@Request() req) {
    if (!req.user || !req.user.role) {
      throw new UnauthorizedException('Invalid user data');
    }

    const allFeatures = {
      courses: [Role.STUDENT, Role.PARENT],
      classes: [Role.STUDENT, Role.PARENT],
      timetable: [Role.STUDENT, Role.PARENT],
      grades: [Role.STUDENT, Role.PARENT],
      assignments: [Role.STUDENT],
      submitAssignments: [Role.STUDENT],
      // joinClasses: [Role.STUDENT],
      childProgress: [Role.PARENT],
      attendance: [Role.PARENT],
      announcements: [Role.PARENT],
      libraryAccess: [Role.STUDENT],
      paymentHistory: [Role.PARENT],
    };

    const availableFeatures = Object.entries(allFeatures)
      .filter(([_, roles]) => roles.includes(req.user.role))
      .map(([feature]) => feature);

    return {
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        name: req.user.username || req.user.email.split('@')[0],
      },
      features: availableFeatures,
      uiConfig: this.getStudentUIConfig(req.user.role),
      stats: this.getStudentStats(req.user.role),
    };
  }

  private getStudentUIConfig(role: Role) {
    const configs = {
      [Role.STUDENT]: {
        dashboardTitle: 'Student Dashboard',
        primaryColor: 'blue-600',
        secondaryColor: 'blue-400',
        showParentFeatures: false,
      },
      [Role.PARENT]: {
        dashboardTitle: 'Parent Dashboard',
        primaryColor: 'blue-600',
        secondaryColor: 'blue-400',
        showParentFeatures: true,
      },
    };
    return configs[role] || configs[Role.STUDENT];
  }

  private getStudentStats(role: Role) {
    return {
      [Role.STUDENT]: {
        upcomingClasses: 3,
        pendingAssignments: 2,
        averageGrade: 'B+',
        attendancePercentage: 92,
      },
      [Role.PARENT]: {
        childrenCount: 1,
        lastPaymentDate: '2023-05-15',
        childAttendance: 95,
        upcomingMeetings: 1,
      },
    }[role];
  }

  }
