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
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CourseService } from 'src/course/course.service';
import { CreateCourseDto } from 'src/course/dto/create-course.dto';
import { UpdateCourseDto } from 'src/course/dto/update-course.dto';
import { TeachersService } from 'src/teacher/teacher.service';
import { Role } from 'src/user/enums/role.enum';
import { Between, Like, Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Teacher } from 'src/user/entities/teacher.entity';
import { EnrollmentService } from 'src/enrollment/enrollment.service';
import { Enrollment } from 'src/enrollment/entities/enrollment.entity';
import { StudentsService } from 'src/student/student.service';

@Controller('course')
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly teacherService: TeachersService,
    private readonly enrollmentService: EnrollmentService,
    @InjectRepository(Teacher)
    private readonly teacherRepository: Repository<Teacher>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    private readonly studentService: StudentsService,
  ) {}

  @Get('course-management')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  async getCourseManagementDashboard(@Request() req) {
    const courses = await this.courseService.findAll();
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
            const teacher = await this.teacherService.findOneByUserId(
              course.teacherId,
            );
            return {
              ...course,
              teacher: teacher
                ? {
                    ...teacher,
                    id: teacher.user.id, // Use UUID instead of numeric ID
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

  // In getCourseManagementStats method
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

    // Get total enrollments across all courses
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
      averageEnrollment: (totalEnrollments / courses.length).toFixed(1),
      totalEnrollments,
    };
  }

  @Get('courses')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
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

    // Add class filter if provided
    if (classId && classId !== 'all') {
      whereConditions.push({ classId });
    }

    const [courses, total] = await Promise.all([
      this.courseService.findAll({
        skip,
        take: limitNum,
        where: whereConditions.length > 0 ? whereConditions : {},
      }),
      this.courseService.count(
        whereConditions.length > 0 ? whereConditions : {},
      ),
    ]);

    return {
      courses: await this.mapCoursesWithTeacherUUIDs(courses),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };
  }

 @Get('stats/total-courses')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  async getTotalCoursesStats(@Request() req): Promise<{
    title: string;
    value: string;
    trend: { value: number; isPositive: boolean };
  }> {
    try {
      // Get total courses count
      const totalCourses = await this.courseService.count();

      // For trend calculation
      const currentDate = new Date();
      const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const previousMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const previousMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

      const [currentMonthCount, previousMonthCount] = await Promise.all([
        this.courseService.count({
          createdAt: Between(currentMonthStart, currentMonthEnd)
        }),
        this.courseService.count({
          createdAt: Between(previousMonthStart, previousMonthEnd)
        })
      ]);

      let trendValue = 0;
      let isPositive = true;

      if (previousMonthCount > 0) {
        trendValue = Math.round(
          ((currentMonthCount - previousMonthCount) / previousMonthCount) * 100
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

  
  @Post('courses')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async createCourse(@Body() createCourseDto: CreateCourseDto) {
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
    return this.courseService.create(createCourseDto);
  }

  @Post('courses/:courseId/assign-teacher')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async assignTeacherToCourse(
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
      // Verify teacher exists - now using teacher ID directly
      const teacher = await this.teacherService.findOneById(body.teacherId);

      // Update the course with the new teacher
      const updatedCourse = await this.courseService.assignTeacher(
        courseId,
        teacher.id,
      );

      return {
        success: true,
        course: {
          ...updatedCourse,
          teacher: {
            id: teacher.id, // Using teacher.id directly
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.user?.email || '', // Optional chaining in case user relation isn't loaded
          },
        },
        message: 'Teacher assigned successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to assign teacher: ' + error.message);
    }
  }

  @Get('courses/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  async getCourse(@Request() req, @Param('id') id: string) {
    if (!isUUID(id)) {
      throw new NotFoundException('Invalid course ID format');
    }

    try {
      const course = await this.courseService.findOne(id);
      const response: any = {
        ...course,
        // Ensure schedule is always an object
        schedule: course.schedule || { days: [], time: '', location: '' },
      };

      if (course.teacherId) {
        const teacher = await this.teacherService.findOneById(course.teacherId);
        response.teacher = teacher
          ? {
              id: teacher.id,
              firstName: teacher.firstName,
              lastName: teacher.lastName,
            }
          : null;
      }

      return response;
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  @Put('courses/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
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
        const teacher = await this.teacherService.findOneByUserId(
          updateCourseDto.teacherId,
        );
        if (!teacher) {
          throw new NotFoundException('Teacher not found');
        }
        updateCourseDto.teacherId = teacher.user.id;
      }

      const updatedCourse = await this.courseService.update(
        id,
        updateCourseDto,
      );
      return {
        success: true,
        course: updatedCourse,
        message: 'Course updated successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to update course: ' + error.message);
    }
  }

  @Delete('courses/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async deleteCourse(@Request() req, @Param('id') id: string) {
    if (!isUUID(id)) {
      throw new NotFoundException('Invalid course ID format');
    }

    try {
      await this.courseService.remove(id);
      return {
        success: true,
        message: 'Course deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to delete course: ' + error.message);
    }
  }

  @Post('courses/:courseId/enroll/:studentId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async enrollStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
  ) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }
    if (!isUUID(studentId)) {
      throw new NotFoundException('Invalid student ID format');
    }

    try {
      const enrollment = await this.enrollmentService.enrollStudent(
        courseId,
        studentId,
      );
      return {
        success: true,
        enrollment,
        message: 'Student enrolled successfully',
      };
    } catch (error) {
      throw new Error('Failed to enroll student: ' + error.message);
    }
  }

  @Delete('courses/:courseId/enroll/:studentId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async unenrollStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
  ) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }
    if (!isUUID(studentId)) {
      throw new NotFoundException('Invalid student ID format');
    }

    try {
      await this.enrollmentService.unenrollStudent(courseId, studentId);
      return {
        success: true,
        message: 'Student unenrolled successfully',
      };
    } catch (error) {
      throw new Error('Failed to unenroll student: ' + error.message);
    }
  }

  @Get('courses/:courseId/enrollments')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  async getCourseEnrollments(
    @Param('courseId') courseId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [enrollments, total] = await Promise.all([
      this.enrollmentService.getCourseEnrollments(courseId),
      this.enrollmentRepository.count({ where: { courseId } }),
    ]);

    return {
      enrollments: enrollments.slice(skip, skip + limitNum),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };
  }

  @Get('courses/:courseId/enrollable-students')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async getEnrollableStudents(@Param('courseId') courseId: string) {
    if (!isUUID(courseId)) {
      throw new NotFoundException('Invalid course ID format');
    }

    // Get the course with class relation
    const course = await this.courseService.findOne(courseId, ['class']);
    if (!course.classId) {
      throw new NotFoundException('Course has no assigned class');
    }

    // Get all students in the same class
    const classStudents = await this.studentService.findByClass(course.classId);

    // Get currently enrolled students
    const enrollments =
      await this.enrollmentService.getCourseEnrollments(courseId);
    const enrolledStudentIds = enrollments.map((e) => e.student.id);

    // Filter out already enrolled students
    const enrollableStudents = classStudents.filter(
      (student) => !enrolledStudentIds.includes(student.id),
    );

    return {
      students: enrollableStudents,
    };
  }
}
