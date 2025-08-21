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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { TeachersService } from '../teacher/teacher.service';
import { Role } from '../user/enums/role.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Like, Repository } from 'typeorm';
import { Teacher } from '../user/entities/teacher.entity';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { SystemLoggingService } from 'src/logs/system-logging.service';

@ApiTags('Courses')
@ApiBearerAuth()
@Controller('course')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly teacherService: TeachersService,
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    private readonly systemLoggingService: SystemLoggingService,
  ) {}

  @Get('course-management')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Get course management dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
  })
  async getCourseManagementDashboard(@Request() req) {
    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const courses = await this.courseService.findAll({ schoolId: req.user?.schoolId, superAdmin: isSuper });
    return {
      courses: await this.mapCoursesWithTeacherUUIDs(courses),
      stats: await this.getCourseManagementStats(courses),
      uiConfig: {
        title: 'Course Management',
        description: 'Manage all courses and curriculum',
        primaryColor: 'blue-800',
        breadcrumbs: [
          { name: 'Dashboard', path: '/dashboard/admin/dashboard' },
          { name: 'Course Management', path: '' },
        ],
      },
    };
  }

  private async mapCoursesWithTeacherUUIDs(courses: any[]) {
    return Promise.all(
      courses.map(async (course) => {
        if (course.teacherId) {
          try {
            const teacher = await this.teacherService.findOneById(
              course.teacherId,
            );
            return {
              ...course,
              teacher: teacher
                ? {
                    id: teacher.id,
                    firstName: teacher.firstName,
                    lastName: teacher.lastName,
                    email: teacher.user?.email || '',
                  }
                : null,
            };
          } catch (e) {
            return course;
          }
        }
        return course;
      }),
    );
  }

  private async getCourseManagementStats(courses: any[]): Promise<any> {
    if (!courses || courses.length === 0) {
      return {
        totalCourses: 0,
        activeCourses: 0,
        upcomingCourses: 0,
        averageEnrollment: 0,
        totalEnrollments: 0,
      };
    }

    const totalEnrollments = courses.reduce(
      (sum, course) => sum + (course.enrollmentCount || 0),
      0,
    );

    return {
      totalCourses: courses.length,
      activeCourses: courses.filter((c) => c.status === 'active').length,
      upcomingCourses: courses.filter(
        (course) => course.startDate && new Date(course.startDate) > new Date(),
      ).length,
      averageEnrollment: totalEnrollments / courses.length || 0,
      totalEnrollments,
    };
  }

// src/course/course.controller.ts
@Get(['', 'courses'])
@Roles(Role.ADMIN, Role.TEACHER)
@ApiOperation({ summary: 'Get all courses' })
@ApiQuery({ name: 'page', required: false, type: Number })
@ApiQuery({ name: 'limit', required: false, type: Number })
@ApiQuery({ name: 'search', required: false, type: String })
@ApiQuery({ name: 'classId', required: false, type: String })
@ApiResponse({ status: 200, description: 'List of courses retrieved successfully' })
async getAllCourses(
  @Request() req,
  @Query('page') page: string = '1',
  @Query('limit') limit: string = '10',
  @Query('search') search?: string,
  @Query('classId') classId?: string,
) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const whereConditions: any[] = search
    ? [
        { name: Like(`%${search}%`) },
        { code: Like(`%${search}%`) },
        { description: Like(`%${search}%`) },
      ]
    : [];

  if (classId && classId !== 'all') {
    whereConditions.push({ classId });
  }

  const isSuper = req.user?.role === 'SUPER_ADMIN';
  const [courses, total] = await Promise.all([
    this.courseService.findAll({
      skip,
      take: limitNum,
      where: whereConditions.length > 0 ? whereConditions : {},
      schoolId: req.user?.schoolId,
      superAdmin: isSuper,
    }),
    this.courseService.count(
      isSuper ? (whereConditions.length > 0 ? whereConditions : {}) : {
        ...(whereConditions.length === 0 ? {} : whereConditions[0]),
        schoolId: req.user?.schoolId,
      },
    ),
  ]);

  const mappedCourses = await this.mapCoursesWithTeacherUUIDs(courses);

  // Add className to each course
  const coursesWithClassName = mappedCourses.map((course) => ({
    ...course,
    className: course.class ? course.class.name : 'Not assigned', // Add className
  }));

  return {
    courses: coursesWithClassName,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  };
}

  @Get('stats/total-courses')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Get total courses statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getTotalCoursesStats(@Request() req): Promise<{
    title: string;
    value: string;
    trend: { value: number; isPositive: boolean };
  }> {
    try {
      const totalCourses = await this.courseService.count();
      const currentDate = new Date();
      const currentMonthStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const currentMonthEnd = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );
      const previousMonthStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1,
      );
      const previousMonthEnd = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        0,
      );

      const [currentMonthCount, previousMonthCount] = await Promise.all([
        this.courseService.count({
          createdAt: Between(currentMonthStart, currentMonthEnd),
        }),
        this.courseService.count({
          createdAt: Between(previousMonthStart, previousMonthEnd),
        }),
      ]);

      let trendValue = 0;
      let isPositive = true;

      if (previousMonthCount > 0) {
        trendValue = Math.round(
          ((currentMonthCount - previousMonthCount) / previousMonthCount) * 100,
        );
        isPositive = trendValue >= 0;
      } else if (currentMonthCount > 0) {
        trendValue = 100;
      }

      return {
        title: 'Total Courses',
        value: totalCourses.toString(),
        trend: {
          value: Math.abs(trendValue),
          isPositive,
        },
      };
    } catch (error) {
      console.error('Error in getTotalCoursesStats:', error);
      throw error;
    }
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new course' })
  @ApiResponse({ status: 201, description: 'Course created successfully' })
  async createCourse(@Request() req, @Body() createCourseDto: CreateCourseDto) {
    if (createCourseDto.teacherId) {
      if (!isUUID(createCourseDto.teacherId)) {
        throw new NotFoundException('Teacher ID must be a valid UUID');
      }

      const teacherExists = await this.teacherRepository.exist({
        where: { id: createCourseDto.teacherId },
      });

      if (!teacherExists) {
        throw new NotFoundException('Teacher not found');
      }
    }
    try {
      const created = await this.courseService.create(createCourseDto);
      await this.systemLoggingService.logAction({
        action: 'COURSE_CREATED',
        module: 'COURSE',
        level: 'info',
        performedBy: req?.user ? {
          id: req.user.sub,
          email: req.user.email,
          role: req.user.role
        } : undefined,
        entityId: created.id,
        entityType: 'Course',
        newValues: {
          id: created.id,
          name: created.name,
          code: created.code,
          teacherId: created.teacherId,
          classId: created.classId
        },
        metadata: { description: 'Course created via CourseController' }
      });
      return created;
    } catch (error) {
      await this.systemLoggingService.logSystemError(error, 'COURSE', 'COURSE_CREATE_ERROR', { payload: createCourseDto });
      throw error;
    }
  }

  @Post(':courseId/assign-teacher')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign a teacher to a course' })
  @ApiResponse({ status: 200, description: 'Teacher assigned successfully' })
  async assignTeacherToCourse(
    @Request() req,
    @Param('courseId') courseId: string,
    @Body() body: { teacherId: string },
  ) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }
    if (!isUUID(body.teacherId)) {
      throw new NotFoundException('Teacher ID must be a valid UUID');
    }

    try {
      const existing = await this.courseService.findOne(courseId, []);
      const teacher = await this.teacherService.findOneById(body.teacherId);
      const updatedCourse = await this.courseService.assignTeacher(
        courseId,
        teacher.id,
      );

      await this.systemLoggingService.logAction({
        action: 'COURSE_TEACHER_ASSIGNED',
        module: 'COURSE',
        level: 'info',
        performedBy: req?.user ? {
          id: req.user.sub,
          email: req.user.email,
          role: req.user.role
        } : undefined,
        entityId: updatedCourse.id,
        entityType: 'Course',
        oldValues: { teacherId: existing?.teacherId },
        newValues: { teacherId: teacher.id },
        metadata: { description: 'Teacher assigned to course' }
      });

      return {
        success: true,
        course: {
          ...updatedCourse,
          teacher: {
            id: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.user?.email || '',
          },
        },
        message: 'Teacher assigned successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      await this.systemLoggingService.logSystemError(error, 'COURSE', 'COURSE_TEACHER_ASSIGN_ERROR', { courseId, teacherId: body.teacherId });
      throw new Error('Failed to assign teacher: ' + error.message);
    }
  }

  // src/course/course.controller.ts
@Get(':id')
@Roles(Role.ADMIN, Role.TEACHER)
@ApiOperation({ summary: 'Get a specific course' })
@ApiResponse({ status: 200, description: 'Course retrieved successfully' })
async getCourse(@Request() req, @Param('id') id: string) {
  if (!isUUID(id)) {
    throw new NotFoundException('Invalid course ID format');
  }

  try {
    const course = await this.courseService.findOne(id, ['teacher', 'class']); // Include class relation
    const response: any = {
      ...course,
      schedule: course.schedule || { days: [], time: '', location: '' },
      classId: course.classId, // Include classId
      className: course.class ? course.class.name : 'Not assigned', // Include className
    };

    if (course.teacherId) {
      const teacher = await this.teacherService.findOneById(course.teacherId);
      response.teacher = teacher
        ? {
            id: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.user?.email || '',
          }
        : null;
    }

    return response;
  } catch (error) {
    throw new NotFoundException(error.message);
  }
}

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a course' })
  @ApiResponse({ status: 200, description: 'Course updated successfully' })
  async updateCourse(
    @Request() req,
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
  ) {
    if (!isUUID(id)) {
      throw new NotFoundException('Invalid course ID format');
    }

    try {
      if (updateCourseDto.teacherId && !isUUID(updateCourseDto.teacherId)) {
        throw new NotFoundException('Teacher ID must be a valid UUID');
      }

      if (updateCourseDto.teacherId) {
        const teacher = await this.teacherService.findOneById(
          updateCourseDto.teacherId,
        );
        if (!teacher) {
          throw new NotFoundException('Teacher not found');
        }
        updateCourseDto.teacherId = teacher.id;
      }

      const before = await this.courseService.findOne(id, []);
      const updatedCourse = await this.courseService.update(id, updateCourseDto);
      await this.systemLoggingService.logAction({
        action: 'COURSE_UPDATED',
        module: 'COURSE',
        level: 'info',
        performedBy: req?.user ? {
          id: req.user.sub,
          email: req.user.email,
          role: req.user.role
        } : undefined,
        entityId: id,
        entityType: 'Course',
        oldValues: {
          name: before?.name,
          code: before?.code,
          teacherId: before?.teacherId,
          classId: before?.classId
        },
        newValues: {
          name: updatedCourse.name,
          code: updatedCourse.code,
          teacherId: updatedCourse.teacherId,
          classId: updatedCourse.classId
        },
        metadata: { description: 'Course updated' }
      });
      return {
        success: true,
        course: updatedCourse,
        message: 'Course updated successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      await this.systemLoggingService.logSystemError(error, 'COURSE', 'COURSE_UPDATE_ERROR', { id, payload: updateCourseDto });
      throw new Error('Failed to update course: ' + error.message);
    }
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a course' })
  @ApiResponse({ status: 200, description: 'Course deleted successfully' })
  async deleteCourse(@Request() req, @Param('id') id: string) {
    if (!isUUID(id)) {
      throw new NotFoundException('Invalid course ID format');
    }

    try {
      const existing = await this.courseService.findOne(id, []);
      await this.courseService.remove(id);
      await this.systemLoggingService.logAction({
        action: 'COURSE_DELETED',
        module: 'COURSE',
        level: 'info',
        performedBy: req?.user ? {
          id: req.user.sub,
          email: req.user.email,
          role: req.user.role
        } : undefined,
        entityId: id,
        entityType: 'Course',
        oldValues: existing ? {
          name: existing.name,
          code: existing.code,
          teacherId: existing.teacherId,
          classId: existing.classId
        } : undefined,
        metadata: { description: 'Course deleted' }
      });
      return {
        success: true,
        message: 'Course deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      await this.systemLoggingService.logSystemError(error, 'COURSE', 'COURSE_DELETE_ERROR', { id });
      throw new Error('Failed to delete course: ' + error.message);
    }
  }

  @Get(':courseId/enrollable-students')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get students eligible for enrollment in a course' })
  async getEnrollableStudents(@Param('courseId') courseId: string) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }

    // Fetch the course with its class relation
    const course = await this.courseService.findOne(courseId, ['class']);
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    if (!course.classId || !course.class) {
      throw new NotFoundException('Course has no assigned class');
    }

    // Fetch students in the class using the correct relation
    const classStudents = await this.courseService.findStudentsByClass(
      course.classId,
    );
    const enrollments = await this.courseService.getCourseEnrollments(courseId);
    const enrolledStudentIds = enrollments.map((e) => e.student.id);

    const enrollableStudents = classStudents.filter(
      (student) => !enrolledStudentIds.includes(student.id),
    );

    return {
      students: enrollableStudents.map((student) => ({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.user?.email || '',
        className: course.class?.name || 'Not assigned',
      })),
    };
  }

  @Get(':courseId/enrollments')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Get enrollments for a specific course' })
  @ApiResponse({
    status: 200,
    description: 'List of enrollments retrieved successfully',
  })
  async getCourseEnrollments(@Param('courseId') courseId: string) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }

    try {
      const enrollments =
        await this.courseService.getCourseEnrollments(courseId);
      return {
        enrollments: enrollments.map((enrollment) => ({
          id: enrollment.id,
          student: {
            id: enrollment.student?.id || '',
            firstName: enrollment.student?.firstName || 'Unknown',
            lastName: enrollment.student?.lastName || '',
            email: enrollment.student?.user?.email || '',
          },
          course: {
            id: enrollment.course?.id || '',
            name: enrollment.course?.name || 'Unknown',
          },
          enrollmentDate: enrollment.createdAt.toISOString(),
          status: enrollment.status,
        })),
      };
    } catch (error) {
      throw new NotFoundException(
        `Failed to fetch enrollments: ${error.message}`,
      );
    }
  }
}
