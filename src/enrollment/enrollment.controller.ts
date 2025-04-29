// import {
//   Controller,
//   Get,
//   Post,
//   Delete,
//   UseGuards,
//   Body,
//   Param,
//   NotFoundException,
//   BadRequestException,
//   Request,
//   Query,
// } from '@nestjs/common';
// import { StudentEnrollmentService } from 'src/course/modules/student-enrollment/student-enrollment.service';
// import { AuthGuard } from '@nestjs/passport';
// import { RolesGuard } from 'src/auth/guards/roles.guard';
// import { Roles } from 'src/common/decorators/roles.decorator';
// import { Role } from 'src/user/enums/role.enum';
// import { isUUID } from 'class-validator';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Enrollment } from 'src/course/modules/student-enrollment/entities/enrollment.entity';
// import { BulkEnrollmentDto, CreateEnrollmentDto } from 'src/course/modules/student-enrollment/dto/create-enrollment.dto';

// @Controller('dashboard/admin')
// export class AdminEnrollmentController {
//   constructor(
//     private readonly studentEnrollmentService: StudentEnrollmentService,
//     @InjectRepository(Enrollment)
//     private readonly enrollmentRepository: Repository<Enrollment>,
//   ) {}

//   @Get('enrollment-management')
//   @UseGuards(AuthGuard('jwt'), RolesGuard)
//   @Roles(Role.ADMIN, Role.TEACHER)
//   async getEnrollmentManagementDashboard(@Request() req) {
//     const enrollments = await this.enrollmentRepository.find({
//       relations: ['course', 'student'],
//     });

//     return {
//       enrollments: enrollments.map(enrollment => ({
//         ...enrollment,
//         courseName: enrollment.course?.name,
//         studentName: `${enrollment.student?.firstName} ${enrollment.student?.lastName}`,
//       })),
//       stats: await this.getEnrollmentStats(enrollments),
//       uiConfig: {
//         title: 'Enrollment Management',
//         description: 'Manage student enrollments in courses',
//         primaryColor: 'green-800',
//         breadcrumbs: [
//           { name: 'Dashboard', path: '/dashboard/admin/dashboard' },
//           { name: 'Enrollment Management', path: '' },
//         ],
//       },
//     };
//   }

//   private async getEnrollmentStats(enrollments: Enrollment[]) {
//     if (!enrollments || enrollments.length === 0) {
//       return {
//         totalEnrollments: 0,
//         // Since we don't have status, we'll just count all enrollments as active
//         activeEnrollments: 0,
//         completedEnrollments: 0,
//         averageEnrollmentsPerCourse: 0,
//       };
//     }

//     const uniqueCourses = new Set(enrollments.map(e => e.courseId));
//     const averageEnrollments = enrollments.length / uniqueCourses.size;

//     return {
//       totalEnrollments: enrollments.length,
//       // Since there's no status field, all enrollments are considered active
//       activeEnrollments: enrollments.length,
//       completedEnrollments: 0,
//       averageEnrollmentsPerCourse: averageEnrollments.toFixed(1),
//     };
//   }

//   @Get('enrollments')
//   @UseGuards(AuthGuard('jwt'), RolesGuard)
//   @Roles(Role.ADMIN, Role.TEACHER)
//   async getAllEnrollments(
//     @Request() req,
//     @Query('page') page: string = '1',
//     @Query('limit') limit: string = '10',
//     @Query('courseId') courseId?: string,
//     // Removed status filter since it's not in the entity
//   ) {
//     const pageNum = parseInt(page, 10) || 1;
//     const limitNum = parseInt(limit, 10) || 10;
//     const skip = (pageNum - 1) * limitNum;

//     const whereOptions: any = {};
//     if (courseId && isUUID(courseId)) {
//       whereOptions.courseId = courseId;
//     }

//     const [enrollments, total] = await Promise.all([
//       this.enrollmentRepository.find({
//         where: whereOptions,
//         relations: ['course', 'student'],
//         skip,
//         take: limitNum,
//       }),
//       this.enrollmentRepository.count({ where: whereOptions }),
//     ]);

//     return {
//       enrollments: enrollments.map(enrollment => ({
//         ...enrollment,
//         courseName: enrollment.course?.name,
//         studentName: `${enrollment.student?.firstName} ${enrollment.student?.lastName}`,
//       })),
//       pagination: {
//         currentPage: pageNum,
//         totalPages: Math.ceil(total / limitNum),
//         totalItems: total,
//         itemsPerPage: limitNum,
//       },
//     };
//   }

//   @Get('courses/enrollments')
//   @Roles(Role.ADMIN, Role.TEACHER)
//   async getStudentsForEnrollment(@Query('courseId') courseId: string) {
//     if (!courseId || !isUUID(courseId)) {
//       throw new BadRequestException('Invalid course ID format');
//     }
    
//     const enrollments = await this.enrollmentRepository.find({
//       where: { courseId },
//       relations: ['student']
//     });
  
//     return {
//       enrollments: enrollments.map(e => ({
//         enrollmentId: e.id,
//         studentId: e.student.id,
//         firstName: e.student.firstName,
//         lastName: e.student.lastName,
//         email: e.student.user.email
//       })),
//       courseId
//     };
//   }

//   @Post('enrollments')
//   @Roles(Role.ADMIN)
//   async enrollStudent(@Body() createEnrollmentDto: CreateEnrollmentDto) {
//     if (!isUUID(createEnrollmentDto.courseId) || !isUUID(createEnrollmentDto.studentId)) {
//       throw new BadRequestException('Invalid ID format');
//     }

//     try {
//       const enrollment = await this.studentEnrollmentService.enrollStudent(createEnrollmentDto);
//       return {
//         success: true,
//         enrollment,
//         message: 'Student enrolled successfully',
//       };
//     } catch (error) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   @Post('enrollments/bulk')
//   @Roles(Role.ADMIN)
//   async bulkEnroll(@Body() bulkEnrollmentDto: BulkEnrollmentDto) {
//     if (!isUUID(bulkEnrollmentDto.courseId)) {
//       throw new BadRequestException('Invalid course ID format');
//     }
//     if (!Array.isArray(bulkEnrollmentDto.studentIds) || bulkEnrollmentDto.studentIds.some(id => !isUUID(id))) {
//       throw new BadRequestException('Invalid student IDs format');
//     }

//     try {
//       const result = await this.studentEnrollmentService.bulkEnroll(bulkEnrollmentDto);
//       return {
//         success: true,
//         ...result,
//         message: 'Bulk enrollment completed successfully',
//       };
//     } catch (error) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   @Delete('enrollments/course/:courseId/student/:studentId')
//   @Roles(Role.ADMIN)
//   async unenrollStudent(
//     @Param('courseId') courseId: string,
//     @Param('studentId') studentId: string,
//   ) {
//     if (!isUUID(courseId) || !isUUID(studentId)) {
//       throw new BadRequestException('Invalid ID format');
//     }

//     try {
//       await this.studentEnrollmentService.unenrollStudent(courseId, studentId);
//       return {
//         success: true,
//         message: 'Student unenrolled successfully',
//       };
//     } catch (error) {
//       if (error instanceof NotFoundException) {
//         throw error;
//       }
//       throw new BadRequestException(error.message);
//     }
//   }
// }