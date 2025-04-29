import { Controller, Get, Post, Put, Delete, Request, UseGuards, Body, Param, NotFoundException, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Like } from 'typeorm';
import { Teacher } from 'src/user/entities/teacher.entity';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TeachersService } from './teacher.service';
import { Roles } from 'src/user/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';
import { CreateTeacherDto } from 'src/user/dtos/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Controller('teacher')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class TeacherController {
  constructor(private readonly teacherService: TeachersService) {}

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
      (teacher) => teacher.hireDate && new Date(teacher.hireDate) > thirtyDaysAgo,
    ).length;

    return {
      totalTeachers: teachers.length,
      activeTeachers: teachers.filter((t) => t.status === 'active').length,
      newHires,
      averageExperience: averageExperience.toFixed(1) + ' years',
    };
  }

  // admin-teacher.controller.ts
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
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const whereConditions = search
      ? [
          { firstName: Like(`%${search}%`) },
          { lastName: Like(`%${search}%`) },
          { user: { email: Like(`%${search}%`) } },
        ]
      : {};

    const [teachers, total] = await Promise.all([
      this.teacherService.findAll({
        skip,
        take: limitNum,
        where: whereConditions,
      }),
      this.teacherService.count(whereConditions),
    ]);

    return {
      teachers,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };
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
      const updatedTeacher = await this.teacherService.update(id, updateTeacherDto);
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