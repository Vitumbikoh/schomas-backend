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
import { Like } from 'typeorm';
import { Teacher } from 'src/user/entities/teacher.entity';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TeachersService } from './teacher.service';
import { Roles } from 'src/user/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';
import { CreateTeacherDto } from 'src/user/dtos/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { UsersService } from 'src/user/user.service';

@Controller('teacher')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TeacherController {
  constructor(
    private readonly teacherService: TeachersService,
    private readonly userService: UsersService,
  ) {}

  @Get('teacher-management')
  async getTeacherManagementDashboard() {
    const teachers = await this.teacherService.findAll();
    const stats = await this.getTeacherManagementStats(teachers);

    return {
      teachers,
      stats,
      uiConfig: {
        title: 'Teacher Management',
        description: 'Manage all teacher records and information',
        primaryColor: 'blue-800',
        breadcrumbs: [
          { name: 'Dashboard', path: '/dashboard/admin/dashboard' },
          { name: 'Teacher Management', path: '' },
        ],
      },
    };
  }

  private async getTeacherManagementStats(teachers: Teacher[]): Promise<any> {
    if (!teachers || teachers.length === 0) {
      return {
        totalTeachers: 0,
        activeTeachers: 0,
        newHires: 0,
        averageExperience: '0 years',
      };
    }

    const totalExperience = teachers.reduce(
      (sum, teacher) => sum + (teacher.yearsOfExperience || 0),
      0,
    );
    const averageExperience = totalExperience / teachers.length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newHires = teachers.filter(
      (teacher) =>
        teacher.hireDate && new Date(teacher.hireDate) > thirtyDaysAgo,
    ).length;

    return {
      totalTeachers: teachers.length,
      activeTeachers: teachers.filter((t) => t.status === 'active').length,
      newHires,
      averageExperience: averageExperience.toFixed(1) + ' years',
    };
  }

  @Post('teachers')
  async createTeacher(@Body() createTeacherDto: CreateTeacherDto) {
    try {
      const newTeacher = await this.teacherService.create(createTeacherDto);
      return {
        success: true,
        teacher: newTeacher,
        message: 'Teacher created successfully',
      };
    } catch (error) {
      throw new Error('Failed to create teacher: ' + error.message);
    }
  }

  @Get('teachers')
  async getAllTeachers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      const where = search
        ? [
            { firstName: Like(`%${search}%`) },
            { lastName: Like(`%${search}%`) },
            { user: { email: Like(`%${search}%`) } },
          ]
        : {};

      const teachers = await this.teacherService.findAll({
        skip,
        take: limitNum,
        where,
      });

      const total = await this.teacherService.count(where);

      return {
        success: true,
        teachers,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      };
    } catch (error) {
      console.error('Error fetching teachers:', error);
      throw new Error('Failed to fetch teachers: ' + error.message);
    }
  }

  @Get('my-students')
  @Roles(Role.TEACHER)
  async getMyStudents(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      const userId = req.user?.sub;
      console.log('Request user:', req.user);
      if (!userId) {
        console.error('No user ID found in request');
        throw new ForbiddenException('Invalid user authentication');
      }
      console.log(`Authenticated user ID: ${userId}`);

      const teacher = await this.teacherService.findOneByUserId(userId);
      console.log(
        `Associated teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.id})`,
      );

      if (!teacher) {
        console.error(`Teacher not found for user ID: ${userId}`);
        throw new NotFoundException('Your teacher record was not found');
      }

      const allStudents = await this.teacherService.getStudentsForTeacher(
        teacher.id,
      );
      console.log(`Total students found: ${allStudents.length}`);

      let filteredStudents = allStudents;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredStudents = allStudents.filter(
          (student) =>
            student.firstName.toLowerCase().includes(searchLower) ||
            student.lastName.toLowerCase().includes(searchLower) ||
            student.email?.toLowerCase().includes(searchLower) ||
            student.class?.name.toLowerCase().includes(searchLower),
        );
        console.log(`Students after search filter: ${filteredStudents.length}`);
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const total = filteredStudents.length;
      const paginatedStudents = filteredStudents.slice(
        (pageNum - 1) * limitNum,
        pageNum * limitNum,
      );

      return {
        success: true,
        students: paginatedStudents,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      };
    } catch (error) {
      console.error('Error in getMyStudents:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch students: ' + error.message,
      );
    }
  }

  @Get('teachers/:id')
  async getTeacher(@Param('id') id: string) {
    try {
      return await this.teacherService.findOne(id);
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Put('teachers/:id')
  async updateTeacher(
    @Param('id') id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
  ) {
    try {
      const updatedTeacher = await this.teacherService.update(
        id,
        updateTeacherDto,
      );
      return {
        success: true,
        teacher: updatedTeacher,
        message: 'Teacher updated successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to update teacher: ' + error.message);
    }
  }

  @Delete('teachers/:id')
  async deleteTeacher(@Param('id') id: string) {
    try {
      await this.teacherService.remove(id);
      return {
        success: true,
        message: 'Teacher deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to delete teacher: ' + error.message);
    }
  }
}