import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Request,
  UseGuards,
  Body,
  Param,
  NotFoundException,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Like, Between } from 'typeorm';
import { Teacher } from 'src/user/entities/teacher.entity';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TeachersService } from './teacher.service';
import { Roles } from 'src/user/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';
import { CreateTeacherDto } from 'src/user/dtos/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { UsersService } from 'src/user/user.service';
import { SubmitGradesDto } from 'src/exams/dto/submit-grades.dto';
import { BadRequestException } from '@nestjs/common';
import { ExamService } from 'src/exams/exam.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';

@Controller('teacher')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TeacherController {
  constructor(
    private readonly teacherService: TeachersService,
    private readonly userService: UsersService,
    private readonly examService: ExamService,
    private readonly systemLoggingService: SystemLoggingService,
  ) {}

  @Get('total-teachers')
  async getTotalTeachers(@Request() req, @Query('schoolId') schoolIdOverride?: string) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const schoolScope = isSuper ? (schoolIdOverride || req.user?.schoolId) : req.user?.schoolId;
    const where: any = {};
    if (!schoolScope && !isSuper) return { total: 0 };
    const total = schoolScope
      ? await this.teacherService.countTeachersBySchool(schoolScope)
      : await this.teacherService.count({});
    return { total, filters: { schoolId: schoolScope } };
  }

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
  async createTeacher(@Body() createTeacherDto: CreateTeacherDto, @Request() req) {
    try {
      // Attach schoolId from requesting admin if not super admin override
      if (req.user?.role !== 'SUPER_ADMIN') {
        (createTeacherDto as any).schoolId = req.user?.schoolId;
      }
      const newTeacher = await this.teacherService.create(createTeacherDto);

      // Log teacher creation
      await this.systemLoggingService.logAction({
        action: 'TEACHER_CREATED',
        module: 'TEACHERS',
        level: 'info',
        performedBy: {
          id: req.user?.sub,
          email: req.user?.email,
          role: req.user?.role,
          name: req.user?.username || req.user?.email
        },
        entityId: newTeacher.id,
        entityType: 'Teacher',
        newValues: {
          id: newTeacher.id,
          firstName: newTeacher.firstName,
          lastName: newTeacher.lastName,
          phoneNumber: newTeacher.phoneNumber,
          qualification: newTeacher.qualification,
          subjectSpecialization: newTeacher.subjectSpecialization
        },
        metadata: {
          description: `Teacher created: ${newTeacher.firstName} ${newTeacher.lastName}`,
          qualification: newTeacher.qualification
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return {
        success: true,
        teacher: newTeacher,
        message: 'Teacher created successfully',
      };
    } catch (error) {
      // Log the error
      await this.systemLoggingService.logSystemError(
        error,
        'TEACHERS',
        'TEACHER_CREATE_FAILED',
        {
          firstName: createTeacherDto.firstName,
          lastName: createTeacherDto.lastName,
          email: createTeacherDto.email
        }
      );
      
      throw new Error('Failed to create teacher: ' + error.message);
    }
  }

  @Get('teachers')
  @UseGuards(AuthGuard('jwt'))
  @Roles(Role.ADMIN, Role.TEACHER)
  async getAllTeachers(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('schoolId') schoolIdFilter?: string,
  ) {
    try {
      console.log('Authenticated user:', req.user); // Log user details
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
      const [teachers, total] = await this.teacherService.findAllPaginated(
        pageNum,
        limitNum,
        search,
        effectiveSchoolId,
        isSuper,
      );

      return {
        success: true,
        teachers,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
  },
  filters: { schoolId: effectiveSchoolId, search },
      };
    } catch (error) {
      console.error('Error fetching teachers:', error);
      throw new Error('Failed to fetch teachers: ' + error.message);
    }
  }

  @Get('my-schedules')
  @Roles(Role.TEACHER)
  async getMySchedules(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        console.error('No user ID found in request');
        throw new ForbiddenException('Invalid user authentication');
      }
      console.log(`Authenticated user ID: ${userId}`);

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        console.error(`Teacher not found for user ID: ${userId}`);
        throw new NotFoundException('Your teacher record was not found');
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;

      const { schedules, total } =
        await this.teacherService.getSchedulesForTeacher(
          teacher.id,
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
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch schedules: ' + error.message,
      );
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

  @Get('my-students/count')
  @Roles(Role.TEACHER)
  async getMyStudentsCount(@Request() req) {
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

      const totalStudents = await this.teacherService.getTotalStudentsCount(
        teacher.id,
      );
      console.log(
        `Total students count for teacher ${teacher.id}: ${totalStudents}`,
      );

      return {
        success: true,
        totalStudents,
      };
    } catch (error) {
      console.error('Error in getMyStudentsCount:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch student count: ' + error.message,
      );
    }
  }

  @Get('students/:studentId')
  @Roles(Role.TEACHER)
  async getStudentDetails(@Param('studentId') studentId: string, @Request() req) {
    try {
      const userId = req.user?.sub;
      console.log('Request user:', req.user);
      if (!userId) {
        console.error('No user ID found in request');
        throw new ForbiddenException('Invalid user authentication');
      }

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        console.error(`Teacher not found for user ID: ${userId}`);
        throw new NotFoundException('Your teacher record was not found');
      }

      const studentDetails = await this.teacherService.getStudentDetailsForTeacher(
        teacher.id,
        studentId,
      );

      return {
        success: true,
        student: studentDetails,
      };
    } catch (error) {
      console.error('Error in getStudentDetails:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch student details: ' + error.message,
      );
    }
  }

  @Get('my-courses/count')
  @Roles(Role.TEACHER)
  async getMyCoursesCount(@Request() req) {
    try {
      const userId = req.user?.sub;
      const userSchoolId = req.user?.schoolId;
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

      const totalCourses = await this.teacherService.getTotalCoursesCount(
        teacher.id,
        userSchoolId,
        false,
      );
      console.log(
        `Total courses count for teacher ${teacher.id}: ${totalCourses}`,
      );

      return {
        success: true,
        totalCourses,
      };
    } catch (error) {
      console.error('Error in getMyCoursesCount:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch course count: ' + error.message,
      );
    }
  }

  @Get('my-courses')
  @Roles(Role.TEACHER)
  async getMyCourses(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('classId') classId?: string,
    @Query('includeExams') includeExams?: string,
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

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const shouldIncludeExams = includeExams === 'true';

      const { courses, total } = await this.teacherService.getCoursesForTeacher(
        teacher.id,
        pageNum,
        limitNum,
        search,
        shouldIncludeExams,
        classId,
      );
      console.log(`Total courses found: ${total}`);

      return {
        success: true,
        totalCourses: total,
        courses,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
          shouldIncludeExams,
        },
      };
    } catch (error) {
      console.error('Error in getMyCourses:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException('Failed to fetch courses: ' + error.message);
    }
  }

  @Get('my-exams')
  @Roles(Role.TEACHER)
  async getMyExams(
    @Request() req,
    @Query('courseId') courseId: string,
  ) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new ForbiddenException('Invalid user authentication');
      }
      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        throw new NotFoundException('Your teacher record was not found');
      }
      if (!courseId) {
        throw new BadRequestException('courseId is required');
      }

      const exams = await this.examService.findByCourseAndTeacher(
        courseId,
        teacher.id,
        teacher.schoolId,
        false,
      );

      return { success: true, exams };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new ForbiddenException('Failed to fetch exams: ' + error.message);
    }
  }

  @Get('my-exams/all')
  @Roles(Role.TEACHER)
  async getAllMyExams(
    @Request() req,
    @Query('termId') termId?: string,
  ) {
    try {
      const userId = req.user?.sub;
      if (!userId) throw new ForbiddenException('Invalid user authentication');
      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) throw new NotFoundException('Your teacher record was not found');

      const exams = await this.examService.findAllForTeacherByTerm(
        teacher.id,
        termId,
        teacher.schoolId,
        false,
      );

      return { success: true, exams };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new ForbiddenException('Failed to fetch exams: ' + error.message);
    }
  }

  @Get('my-classes')
  @Roles(Role.TEACHER)
  async getMyClasses(@Request() req) {
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

      const classes = await this.teacherService.getClassesForTeacher(
        teacher.id,
      );
      console.log(
        `Total classes found for teacher ${teacher.id}: ${classes.length}`,
      );

      return {
        success: true,
        classes,
      };
    } catch (error) {
      console.error('Error in getMyClasses:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException('Failed to fetch classes: ' + error.message);
    }
  }

  @Get('my-courses/by-class/:classId')
  @Roles(Role.TEACHER)
  async getMyCoursesByClass(
    @Request() req,
    @Param('classId') classId: string,
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

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;

      const { courses, total } =
        await this.teacherService.getCoursesForTeacherByClass(
          teacher.id,
          classId,
          pageNum,
          limitNum,
          search,
        );
      console.log(`Total courses found for class ${classId}: ${total}`);

      return {
        success: true,
        courses,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      };
    } catch (error) {
      console.error('Error in getMyCoursesByClass:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch courses for class: ' + error.message,
      );
    }
  }

  @Get('my-students/by-course/:courseId')
  @Roles(Role.TEACHER)
  async getMyStudentsByCourse(
    @Request() req,
    @Param('courseId') courseId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new ForbiddenException('Invalid user authentication');
      }

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        throw new NotFoundException('Your teacher record was not found');
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;

      const { students, total } =
        await this.teacherService.getStudentsForTeacherByCourse(
          teacher.id,
          courseId,
          pageNum,
          limitNum,
          search,
        );

      return {
        success: true,
        students,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      };
    } catch (error) {
      console.error('Error in getMyStudentsByCourse:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch students for course: ' + error.message,
      );
    }
  }

  @Get('my-upcoming-classes')
  @Roles(Role.TEACHER)
  async getMyUpcomingClasses(@Request() req) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        console.error('No user ID found in request');
        throw new ForbiddenException('Invalid user authentication');
      }
      console.log(`Authenticated user ID: ${userId}`);

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        console.error(`Teacher not found for user ID: ${userId}`);
        throw new NotFoundException('Your teacher record was not found');
      }

      const currentDate = new Date();
      const classes = await this.teacherService.getUpcomingClassesForTeacher(
        teacher.id,
        currentDate,
      );
      console.log(
        `Total upcoming classes found for teacher ${teacher.id}: ${classes.length}`,
      );

      return {
        success: true,
        classes,
      };
    } catch (error) {
      console.error('Error in getMyUpcomingClasses:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch upcoming classes: ' + error.message,
      );
    }
  }

  @Get('my-attendance-today')
  @Roles(Role.TEACHER)
  async getMyAttendanceToday(@Request() req) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        console.error('No user ID found in request');
        throw new ForbiddenException('Invalid user authentication');
      }
      console.log(`Authenticated user ID: ${userId}`);

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        console.error(`Teacher not found for user ID: ${userId}`);
        throw new NotFoundException('Your teacher record was not found');
      }

      const attendance = await this.teacherService.getAttendanceForTeacherToday(
        teacher.id,
      );
      console.log(
        `Total attendance records found for teacher ${teacher.id}: ${attendance.length}`,
      );

      return {
        success: true,
        attendance,
      };
    } catch (error) {
      console.error('Error in getMyAttendanceToday:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch attendance: ' + error.message,
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
    @Request() req,
  ) {
    try {
      // Get original teacher data for logging
      const originalTeacher = await this.teacherService.findOne(id);
      
      const updatedTeacher = await this.teacherService.update(
        id,
        updateTeacherDto,
      );

      // Log teacher update
      await this.systemLoggingService.logAction({
        action: 'TEACHER_UPDATED',
        module: 'TEACHERS',
        level: 'info',
        performedBy: {
          id: req.user?.sub,
          email: req.user?.email,
          role: req.user?.role,
          name: req.user?.username || req.user?.email
        },
        entityId: id,
        entityType: 'Teacher',
        oldValues: {
          firstName: originalTeacher.firstName,
          lastName: originalTeacher.lastName,
          phoneNumber: originalTeacher.phoneNumber,
          qualification: originalTeacher.qualification,
          subjectSpecialization: originalTeacher.subjectSpecialization
        },
        newValues: updateTeacherDto,
        metadata: {
          description: `Teacher updated: ${updatedTeacher.firstName} ${updatedTeacher.lastName}`,
          qualification: updatedTeacher.qualification
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return {
        success: true,
        teacher: updatedTeacher,
        message: 'Teacher updated successfully',
      };
    } catch (error) {
      // Log the error
      await this.systemLoggingService.logSystemError(
        error,
        'TEACHERS',
        'TEACHER_UPDATE_FAILED',
        { teacherId: id, updateData: updateTeacherDto }
      );

      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to update teacher: ' + error.message);
    }
  }

  @Delete('teachers/:id')
  async deleteTeacher(@Param('id') id: string) {
    try {
      // Capture original teacher data before deletion for logging
      const originalTeacher = await this.teacherService.findOne(id);
      
      await this.teacherService.remove(id);
      
      // Log successful deletion
      await this.systemLoggingService.logAction({
        action: 'delete_teacher',
        module: 'teacher',
        level: 'info',
        entityId: id,
        entityType: 'Teacher',
        oldValues: {
          id: originalTeacher.id,
          firstName: originalTeacher.firstName,
          lastName: originalTeacher.lastName,
          phoneNumber: originalTeacher.phoneNumber,
          address: originalTeacher.address,
          qualification: originalTeacher.qualification,
          subjectSpecialization: originalTeacher.subjectSpecialization,
          dateOfBirth: originalTeacher.dateOfBirth,
          gender: originalTeacher.gender,
          hireDate: originalTeacher.hireDate,
          yearsOfExperience: originalTeacher.yearsOfExperience,
          status: originalTeacher.status
        },
        metadata: {
          deletedTeacherName: `${originalTeacher.firstName} ${originalTeacher.lastName}`,
          action_timestamp: new Date().toISOString()
        }
      });
      
      return {
        success: true,
        message: 'Teacher deleted successfully',
      };
    } catch (error) {
      // Log deletion error
      await this.systemLoggingService.logAction({
        action: 'delete_teacher_error',
        module: 'teacher',
        level: 'error',
        entityId: id,
        entityType: 'Teacher',
        errorMessage: error.message,
        stackTrace: error.stack,
        metadata: {
          attempted_action: 'delete_teacher',
          error_timestamp: new Date().toISOString()
        }
      });
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to delete teacher: ' + error.message);
    }
  }

  @Patch('teachers/:id/status')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async updateTeacherStatus(
    @Param('id') id: string,
    @Body() statusData: { status: string },
    @Request() req,
  ) {
    try {
      // Get original teacher data for logging
      const originalTeacher = await this.teacherService.findOne(id);
      
      const updatedTeacher = await this.teacherService.update(id, {
        status: statusData.status,
      });

      // Log teacher status update
      await this.systemLoggingService.logAction({
        action: 'TEACHER_STATUS_UPDATED',
        module: 'TEACHERS',
        level: 'info',
        performedBy: {
          id: req.user?.sub,
          email: req.user?.email,
          role: req.user?.role,
          name: req.user?.username || req.user?.email
        },
        entityId: id,
        entityType: 'Teacher',
        oldValues: {
          status: originalTeacher.status
        },
        newValues: {
          status: statusData.status
        },
        metadata: {
          description: `Teacher status updated: ${updatedTeacher.firstName} ${updatedTeacher.lastName}`,
          previousStatus: originalTeacher.status,
          newStatus: statusData.status
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return {
        success: true,
        teacher: updatedTeacher,
        message: 'Teacher status updated successfully',
      };
    } catch (error) {
      // Log the error
      await this.systemLoggingService.logSystemError(
        error,
        'TEACHERS',
        'TEACHER_STATUS_UPDATE_FAILED',
        { teacherId: id, statusData }
      );

      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to update teacher status: ' + error.message);
    }
  }

  @Get('my-classes-with-courses')
  @Roles(Role.TEACHER)
  async getMyClassesWithCourses(@Request() req) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new ForbiddenException('Invalid user authentication');
      }

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        throw new NotFoundException('Your teacher record was not found');
      }

      const classesWithCourses =
        await this.teacherService.getClassesWithCoursesForTeacher(teacher.id);

      return {
        success: true,
        classes: classesWithCourses,
      };
    } catch (error) {
      console.error('Error in getMyClassesWithCourses:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch classes with courses: ' + error.message,
      );
    }
  }

  @Get('my-students-by-class/:classId')
  @Roles(Role.TEACHER)
  async getMyStudentsByClass(
    @Request() req,
    @Param('classId') classId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new ForbiddenException('Invalid user authentication');
      }

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        throw new NotFoundException('Your teacher record was not found');
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;

      const { students, total } =
        await this.teacherService.getStudentsForTeacherByClass(
          teacher.id,
          classId,
          pageNum,
          limitNum,
          search,
        );

      return {
        success: true,
        students,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
      };
    } catch (error) {
      console.error('Error in getMyStudentsByClass:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException(
        'Failed to fetch students for class: ' + error.message,
      );
    }
  }

  @Get('exams-for-grading')
  @Roles(Role.TEACHER)
  async getExamsForGrading(
    @Request() req,
    @Query('courseId') courseId: string,
  ) {
    const userId = req.user?.sub;
    const teacher = await this.teacherService.findOneByUserId(userId);

    const exams = await this.teacherService.getExamsForGrading(
      teacher.id,
      courseId,
    );

    return {
      success: true,
      exams: exams.filter((exam) => exam.status === 'administered'), // Only show administered exams for grading
    };
  }

  @Post('submit-grades')
  @Roles(Role.TEACHER)
  async submitGrades(@Request() req, @Body() submitGradesDto: SubmitGradesDto) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new ForbiddenException('Invalid user authentication');
      }

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        throw new NotFoundException('Your teacher record was not found');
      }

      // Verify the exam belongs to this teacher
      const exam = await this.examService.findOne(
        submitGradesDto.examId,
        teacher.schoolId, // Pass the teacher's schoolId
        false // Not a super admin
      );
      if (exam.teacher.id !== teacher.id) {
        throw new ForbiddenException(
          'You are not authorized to grade this exam',
        );
      }

      const result = await this.teacherService.submitExamGrades(
        teacher.id,
        submitGradesDto,
      );

      // Log successful grade submission
      await this.systemLoggingService.logAction({
        action: 'submit_grades',
        module: 'teacher',
        level: 'info',
        performedBy: {
          id: userId,
          email: req.user?.email || 'unknown',
          role: 'teacher',
          name: `${teacher.firstName} ${teacher.lastName}`
        },
        entityId: submitGradesDto.examId,
        entityType: 'Exam',
        newValues: {
          examId: submitGradesDto.examId,
          gradedStudents: submitGradesDto.grades?.length || 0,
          teacherId: teacher.id,
          submissionDate: new Date()
        },
        metadata: {
          grades_count: submitGradesDto.grades?.length || 0,
          exam_title: exam.title || 'Unknown',
          submission_timestamp: new Date().toISOString()
        }
      });

      return {
        success: true,
        data: result,
        message: 'Grades submitted successfully',
      };
    } catch (error) {
      // Log grade submission error
      await this.systemLoggingService.logAction({
        action: 'submit_grades_error',
        module: 'teacher',
        level: 'error',
        performedBy: req.user ? {
          id: req.user.sub,
          email: req.user.email || 'unknown',
          role: 'teacher'
        } : undefined,
        entityId: submitGradesDto.examId,
        entityType: 'Exam',
        errorMessage: error.message,
        stackTrace: error.stack,
        metadata: {
          attempted_action: 'submit_grades',
          grades_count: submitGradesDto.grades?.length || 0,
          error_timestamp: new Date().toISOString()
        }
      });

      console.error('Error in submitGrades:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException('Failed to submit grades: ' + error.message);
    }
  }

  @Get('attendance/course/:courseId')
  @Roles(Role.TEACHER)
  async getAttendanceByCourse(
    @Param('courseId') courseId: string,
    @Query('date') date: string,
    @Request() req
  ) {
    try {
      const userId = req.user?.sub;
      console.log('Request user:', req.user);
      if (!userId) {
        console.error('No user ID found in request');
        throw new ForbiddenException('Invalid user authentication');
      }

      const teacher = await this.teacherService.findOneByUserId(userId);
      if (!teacher) {
        console.error(`Teacher not found for user ID: ${userId}`);
        throw new NotFoundException('Your teacher record was not found');
      }

      const attendance = await this.teacherService.getAttendanceByCourse(
        teacher.id,
        courseId,
        date
      );

      return {
        success: true,
        attendance,
      };
    } catch (error) {
      console.error('Error in getAttendanceByCourse:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new ForbiddenException('Failed to fetch attendance: ' + error.message);
    }
  }
}
