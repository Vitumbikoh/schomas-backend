import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Request,
  UseGuards,
  Body,
  Param,
  NotFoundException,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateStudentDto } from 'src/student/dto/update-student.dto';
import { StudentsService } from 'src/student/student.service';
import { CreateStudentDto } from 'src/user/dtos/create-student.dto';
import { Role } from 'src/user/enums/role.enum';
import { Like } from 'typeorm';

@Controller('student')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StudentController {
  constructor(private readonly studentService: StudentsService) {}

  @Get('student-management')
  @Roles(Role.ADMIN)
  async getStudentManagementDashboard(@Request() req) {
    try {
      const students = await this.studentService.findAll();
      const stats = await this.getStudentManagementStats(students);

      return {
        students,
        stats,
        uiConfig: {
          title: 'Student Management',
          description: 'Manage all student records and information',
          primaryColor: 'blue-800',
          breadcrumbs: [
            { name: 'Dashboard', path: '/dashboard/admin/dashboard' },
            { name: 'Student Management', path: '' },
          ],
        },
      };
    } catch (error) {
      throw new Error(
        'Failed to fetch student management data: ' + error.message,
      );
    }
  }

  private async getStudentManagementStats(students: any[]): Promise<any> {
    if (!students || students.length === 0) {
      return {
        totalStudents: 0,
        activeStudents: 0,
        newRegistrations: 0,
        averageAttendance: '0%',
      };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return {
      totalStudents: students.length,
      activeStudents: students.filter((s) => s.isActive !== false).length,
      newRegistrations: students.filter(
        (s) => s.createdAt && new Date(s.createdAt) > thirtyDaysAgo,
      ).length,
      averageAttendance: '95%', // Placeholder - update with real calculation
    };
  }

  @Post('students')
  @Roles(Role.ADMIN)
  async createStudent(@Body() createStudentDto: CreateStudentDto) {
    try {
      if (!createStudentDto.firstName || !createStudentDto.lastName) {
        throw new Error('First name and last name are required');
      }

      const newStudent = await this.studentService.create(createStudentDto);
      return {
        success: true,
        student: newStudent,
        message: 'Student created successfully',
      };
    } catch (error) {
      throw new Error('Failed to create student: ' + error.message);
    }
  }

  @Get('total-students')
  @Roles(Role.ADMIN)
  async getTotalStudentsCount(@Query('activeOnly') activeOnly: boolean) {
    try {
      const total = await this.studentService.getTotalStudentsCount(activeOnly);
      return {
        success: true,
        totalStudents: total,
        activeOnly: activeOnly || false,
      };
    } catch (error) {
      throw new Error('Failed to fetch total student count: ' + error.message);
    }
  }

  @Get('students')
  @Roles(Role.ADMIN, Role.FINANCE)
  async getAllStudents(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      const whereConditions = search
        ? [
            { firstName: Like(`%${search}%`) },
            { lastName: Like(`%${search}%`) },
          ]
        : {};

      const [students, total] = await this.studentService.findAndCount({
        skip,
        take: limitNum,
        where: whereConditions,
        relations: ['user'],
      });

      return {
        students,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      };
    } catch (error) {
      throw new Error('Failed to fetch students: ' + error.message);
    }
  }

  @Get('profile')
  @Roles(Role.STUDENT)
  async getMyProfile(@Request() req) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new ForbiddenException('Invalid user ID');
      }
      const student = await this.studentService.getStudentProfile(userId);
      return {
        success: true,
        student,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new Error('Failed to fetch student profile: ' + error.message);
    }
  }

  @Get('my-schedules')
  @Roles(Role.STUDENT)
  async getMySchedules(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new ForbiddenException('Invalid user ID');
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;

      const { schedules, total } = await this.studentService.getStudentSchedule(
        userId,
        pageNum,
        limitNum,
        search,
      );

      return {
        success: true,
        schedules,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      };
    } catch (error) {
      console.error('Error in getMySchedules:', error);
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new Error('Failed to fetch student schedule: ' + error.message);
    }
  }

  @Get('students/:id')
  @Roles(Role.ADMIN)
  async getStudent(@Param('id') id: string) {
    try {
      const student = await this.studentService.findOne(id);
      if (!student) {
        throw new NotFoundException('Student not found');
      }
      return student;
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Put('students/:id')
  @Roles(Role.ADMIN)
  async updateStudent(
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
  ) {
    try {
      const updatedStudent = await this.studentService.update(
        id,
        updateStudentDto,
      );
      return {
        success: true,
        student: updatedStudent,
        message: 'Student updated successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to update student: ' + error.message);
    }
  }

  @Delete('students/:id')
  @Roles(Role.ADMIN)
  async deleteStudent(@Param('id') id: string) {
    try {
      await this.studentService.remove(id);
      return {
        success: true,
        message: 'Student deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to delete student: ' + error.message);
    }
  }
}