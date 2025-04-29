import { Controller, Get, Post, Put, Delete, Request, UseGuards, Body, Param, NotFoundException, Query } from '@nestjs/common';
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
@Roles(Role.ADMIN)
export class StudentController {
  constructor(private readonly studentService: StudentsService) {}

  @Get('student-management')
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
      throw new Error('Failed to fetch student management data: ' + error.message);
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
      activeStudents: students.filter(s => s.isActive !== false).length,
      newRegistrations: students.filter(s => 
        s.createdAt && new Date(s.createdAt) > thirtyDaysAgo
      ).length,
      averageAttendance: '95%' // Placeholder - update with real calculation
    };
  }

  @Post('students')
  async createStudent(@Body() createStudentDto: CreateStudentDto) {
    try {
      // Ensure required fields are present
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

  @Get('students')
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

  @Get('students/:id')
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
  async updateStudent(
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
  ) {
    try {
      const updatedStudent = await this.studentService.update(id, updateStudentDto);
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