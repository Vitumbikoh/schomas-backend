import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { CourseService } from './course.service';
import { TeachersService } from '../teacher/teacher.service';
import { Like } from 'typeorm';

@Controller('courses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CourseAliasController {
  constructor(
    private readonly courseService: CourseService,
    private readonly teacherService: TeachersService,
  ) {}

  private async mapCoursesWithTeacherUUIDs(courses: any[]) {
    return Promise.all(
      courses.map(async (course) => {
        if (course.teacherId) {
          try {
            const teacher = await this.teacherService.findOneById(course.teacherId);
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

  @Get('')
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
        isSuper
          ? whereConditions.length > 0
            ? (whereConditions as any)
            : {}
          : {
              ...(whereConditions.length === 0 ? {} : (whereConditions[0] as any)),
              schoolId: req.user?.schoolId,
            },
      ),
    ]);

    const mappedCourses = await this.mapCoursesWithTeacherUUIDs(courses);
    const coursesWithClassName = mappedCourses.map((course) => ({
      ...course,
      className: course.class ? course.class.name : 'Not assigned',
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
}
