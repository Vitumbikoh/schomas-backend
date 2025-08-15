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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { LearningMaterialsService } from 'src/learning-materials/learning-materials.service';
import { StudentMaterialDto } from 'src/learning-materials/dtos/student-material.dto';
import { SystemLoggingService } from 'src/logs/system-logging.service';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('student')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StudentController {
  private readonly logger = new Logger(StudentController.name);

  constructor(
    private readonly studentService: StudentsService,
    private readonly systemLoggingService: SystemLoggingService,
    private readonly learningMaterialsService: LearningMaterialsService,
  ) {}

  @Get('student-management')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get student management dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getStudentManagementDashboard(@Request() req) {
    this.logger.log('Fetching student management dashboard');
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
      this.logger.error(`Failed to fetch student management data: ${error.message}`);
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
      activeStudents: students.filter((s) => s.isActive !== false).length,
      newRegistrations: students.filter(
        (s) => s.createdAt && new Date(s.createdAt) > thirtyDaysAgo,
      ).length,
      averageAttendance: '95%',
    };
  }

  @Post('students')
@Roles(Role.ADMIN)
@ApiOperation({ summary: 'Create a new student' })
@ApiResponse({ status: 201, description: 'Student created successfully' })
async createStudent(@Request() req, @Body() createStudentDto: CreateStudentDto) {
  this.logger.log(`Creating student: ${createStudentDto.email}`);
  try {
    if (!createStudentDto.firstName || !createStudentDto.lastName) {
      throw new Error('First name and last name are required');
    }

    // 1. Create student
    const newStudent = await this.studentService.create(createStudentDto);

    // 2. Log the student creation using SystemLoggingService
    await this.systemLoggingService.logAction({
      action: 'STUDENT_CREATED',
      module: 'STUDENTS',
      level: 'info',
      performedBy: {
        id: req.user?.sub,
        email: req.user?.email,
        role: req.user?.role,
        name: req.user?.username || req.user?.email
      },
      entityId: newStudent.id,
      entityType: 'Student',
      newValues: {
        id: newStudent.id,
        firstName: newStudent.firstName,
        lastName: newStudent.lastName,
        studentId: newStudent.studentId,
        phoneNumber: newStudent.phoneNumber
      },
      metadata: {
        description: `Student created: ${newStudent.firstName} ${newStudent.lastName}`,
        studentId: newStudent.studentId
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return {
      success: true,
      student: newStudent,
      message: 'Student created successfully',
    };
  } catch (error) {
    this.logger.error(`Failed to create student: ${error.message}`);
    
    // Log the error
    await this.systemLoggingService.logSystemError(
      error,
      'STUDENTS',
      'STUDENT_CREATION_FAILED',
      {
        firstName: createStudentDto.firstName,
        lastName: createStudentDto.lastName,
        email: createStudentDto.email
      }
    );
    
    throw new Error('Failed to create student: ' + error.message);
  }
}


  @Get('total-students')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get total students count' })
  @ApiResponse({ status: 200, description: 'Total students count retrieved successfully' })
  async getTotalStudentsCount(@Query('activeOnly') activeOnly: boolean) {
    this.logger.log(`Fetching total students count, activeOnly: ${activeOnly}`);
    try {
      const total = await this.studentService.getTotalStudentsCount(activeOnly);
      return {
        success: true,
        totalStudents: total,
        activeOnly: activeOnly || false,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch total student count: ${error.message}`);
      throw new Error('Failed to fetch total student count: ' + error.message);
    }
  }

  @Get('students')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get all students' })
  @ApiResponse({ status: 200, description: 'List of students retrieved successfully' })
  async getAllStudents(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    this.logger.log(`Fetching all students, page: ${page}, limit: ${limit}, search: ${search}`);
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
      this.logger.error(`Failed to fetch students: ${error.message}`);
      throw new Error('Failed to fetch students: ' + error.message);
    }
  }

  @Get('profile')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Get logged-in student profile' })
  @ApiResponse({ status: 200, description: 'Student profile retrieved successfully' })
  async getMyProfile(@Request() req) {
    this.logger.log(`Fetching profile for userId: ${req.user?.sub}`);
    try {
      const userId = req.user?.sub;
      if (!userId) {
        this.logger.error('Invalid user ID');
        throw new ForbiddenException('Invalid user ID');
      }
      const student = await this.studentService.getStudentProfile(userId);
      return {
        success: true,
        student,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch student profile: ${error.message}`);
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new Error('Failed to fetch student profile: ' + error.message);
    }
  }

  @Get('my-schedules')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Get logged-in student schedules' })
  @ApiResponse({ status: 200, description: 'Student schedules retrieved successfully' })
  async getMySchedules(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    this.logger.log(`Fetching schedules for userId: ${req.user?.sub}`);
    try {
      const userId = req.user?.sub;
      if (!userId) {
        this.logger.error('Invalid user ID');
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
      this.logger.error(`Failed to fetch student schedule: ${error.message}`);
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new Error('Failed to fetch student schedule: ' + error.message);
    }
  }

  @Get(':id/courses')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Get courses for a specific student' })
  @ApiResponse({ status: 200, description: 'Student courses retrieved successfully' })
  async getStudentCourses(@Request() req, @Param('id') id: string) {
    this.logger.log(`Fetching courses for student with userId: ${id}`);
    try {
      const userId = req.user?.sub;
      if (!userId || userId !== id) {
        this.logger.error(`Forbidden: userId ${userId} does not match requested id ${id}`);
        throw new ForbiddenException('You can only access your own courses');
      }
      const courses = await this.studentService.getStudentCourses(id);
      return {
        success: true,
        courses,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch student courses: ${error.message}`);
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new Error('Failed to fetch student courses: ' + error.message);
    }
  }

  @Get(':id/materials')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Get learning materials for a specific student' })
  @ApiResponse({ status: 200, description: 'Student learning materials retrieved successfully' })
  async getStudentMaterials(
    @Request() req,
    @Param('id') id: string,
    @Query('courseId') courseId?: string,
  ): Promise<{ success: boolean; materials: StudentMaterialDto[] }> {
    this.logger.log(`Fetching materials for student with userId: ${id}`);
    try {
      const userId = req.user?.sub;
      if (!userId || userId !== id) {
        this.logger.error(`Forbidden: userId ${userId} does not match requested id ${id}`);
        throw new ForbiddenException('You can only access your own materials');
      }
      const materials = await this.learningMaterialsService.getStudentMaterials(id, courseId);
      return {
        success: true,
        materials,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch student materials: ${error.message}`);
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new Error('Failed to fetch student materials: ' + error.message);
    }
  }

  @Get('students/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get a specific student' })
  @ApiResponse({ status: 200, description: 'Student retrieved successfully' })
  async getStudent(@Param('id') id: string) {
    this.logger.log(`Fetching student with id: ${id}`);
    try {
      const student = await this.studentService.findOne(id);
      if (!student) {
        this.logger.error(`Student not found for id: ${id}`);
        throw new NotFoundException('Student not found');
      }
      return student;
    } catch (error) {
      this.logger.error(`Failed to fetch student: ${error.message}`);
      throw new NotFoundException(error.message);
    }
  }

  @Put('students/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a student' })
  @ApiResponse({ status: 200, description: 'Student updated successfully' })
  async updateStudent(
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
    @Request() req,
  ) {
    this.logger.log(`Updating student with id: ${id}`);
    try {
      // Get the original student data first
      const originalStudent = await this.studentService.findOne(id);
      
      const updatedStudent = await this.studentService.update(
        id,
        updateStudentDto,
      );

      // Log the update operation
      await this.systemLoggingService.logAction({
        action: 'STUDENT_UPDATED',
        module: 'STUDENTS',
        level: 'info',
        performedBy: {
          id: req.user?.sub,
          email: req.user?.email,
          role: req.user?.role,
          name: req.user?.username || req.user?.email
        },
        entityId: id,
        entityType: 'Student',
        oldValues: {
          firstName: originalStudent.firstName,
          lastName: originalStudent.lastName,
          phoneNumber: originalStudent.phoneNumber,
          address: originalStudent.address
        },
        newValues: updateStudentDto,
        metadata: {
          description: `Student updated: ${updatedStudent.firstName} ${updatedStudent.lastName}`,
          studentId: updatedStudent.studentId
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return {
        success: true,
        student: updatedStudent,
        message: 'Student updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update student: ${error.message}`);
      
      // Log the error
      await this.systemLoggingService.logSystemError(
        error,
        'STUDENTS',
        'STUDENT_UPDATE_FAILED',
        { studentId: id, updateData: updateStudentDto }
      );
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to update student: ' + error.message);
    }
  }

  @Delete('students/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a student' })
  @ApiResponse({ status: 200, description: 'Student deleted successfully' })
  async deleteStudent(@Param('id') id: string, @Request() req) {
    this.logger.log(`Deleting student with id: ${id}`);
    try {
      // Get student data before deletion for logging
      const studentToDelete = await this.studentService.findOne(id);
      
      await this.studentService.remove(id);

      // Log the deletion
      await this.systemLoggingService.logAction({
        action: 'STUDENT_DELETED',
        module: 'STUDENTS',
        level: 'warn',
        performedBy: {
          id: req.user?.sub,
          email: req.user?.email,
          role: req.user?.role,
          name: req.user?.username || req.user?.email
        },
        entityId: id,
        entityType: 'Student',
        oldValues: {
          firstName: studentToDelete.firstName,
          lastName: studentToDelete.lastName,
          phoneNumber: studentToDelete.phoneNumber,
          studentId: studentToDelete.studentId
        },
        metadata: {
          description: `Student deleted: ${studentToDelete.firstName} ${studentToDelete.lastName}`,
          studentId: studentToDelete.studentId
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return {
        success: true,
        message: 'Student deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete student: ${error.message}`);
      
      // Log the error
      await this.systemLoggingService.logSystemError(
        error,
        'STUDENTS',
        'STUDENT_DELETE_FAILED',
        { studentId: id }
      );
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to delete student: ' + error.message);
    }
  }
}