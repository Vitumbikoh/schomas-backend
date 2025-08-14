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
import { SubmitGradesDto } from 'src/exams/dto/submit-grades.dto';

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
  @UseGuards(AuthGuard('jwt'))
  @Roles(Role.ADMIN)
  async getAllTeachers(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    try {
      console.log('Authenticated user:', req.user); // Log user details
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;

      const [teachers, total] = await this.teacherService.findAllPaginated(
        pageNum,
        limitNum,
        search,
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

  @Get('my-courses/count')
  @Roles(Role.TEACHER)
  async getMyCoursesCount(@Request() req) {
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

      const totalCourses = await this.teacherService.getTotalCoursesCount(
        teacher.id,
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
          shouldIncludeExams
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

      // Validate the teacher has access to this class and course
      const hasAccess =
        await this.teacherService.verifyTeacherClassCourseAccess(
          teacher.id,
          submitGradesDto.classId,
          submitGradesDto.course,
        );

      if (!hasAccess) {
        throw new ForbiddenException(
          'You do not have access to submit grades for this class/course combination',
        );
      }

      const result = await this.teacherService.submitGrades(submitGradesDto);

      return {
        success: true,
        data: result,
        message: 'Grades submitted successfully',
      };
    } catch (error) {
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
}
