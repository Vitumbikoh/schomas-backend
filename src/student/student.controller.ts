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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadedFile, UseInterceptors, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as XLSX from 'xlsx';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateStudentDto } from 'src/student/dto/update-student.dto';
import { StudentsService } from 'src/student/student.service';
import { CreateStudentDto } from 'src/user/dtos/create-student.dto';
import { Role } from 'src/user/enums/role.enum';
import { Like, Between, LessThanOrEqual } from 'typeorm';
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
  const isSuper = req.user?.role === 'SUPER_ADMIN';
  const students = await this.studentService.findAll(undefined, req.user?.schoolId, isSuper);
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

  @Get('students/stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get student statistics for admin dashboard' })
  @ApiResponse({ status: 200, description: 'Student statistics retrieved successfully' })
  async getStudentStats(@Request() req) {
    this.logger.log('Fetching student statistics');
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) {
        throw new ForbiddenException('School ID not found');
      }

      // Get all students for the school
      const students = await this.studentService.findAll(undefined, schoolId, false);

      // Calculate class-based statistics
      const classStats = new Map<string, number>();
      let graduatedCount = 0;

      for (const student of students) {
        if (student.class) {
          const className = student.class.name;
          
          // If student is in the "Graduated" class, count as graduated
          if (className === 'Graduated') {
            graduatedCount++;
          } else {
            // Count in class breakdown for regular classes
            classStats.set(className, (classStats.get(className) || 0) + 1);
          }
        } else {
          // Students without a class are also considered graduated
          graduatedCount++;
        }
      }

      // Convert class stats to array format
      const classBreakdown = Array.from(classStats.entries()).map(([className, count]) => ({
        className,
        count,
      })).sort((a, b) => {
        // Sort by class name (Form 1, Form 2, etc.)
        const getClassNumber = (name: string): number => {
          const match = name.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 999;
        };
        return getClassNumber(a.className) - getClassNumber(b.className);
      });

      return {
        success: true,
        data: {
          totalStudents: students.length,
          classBreakdown,
          graduatedStudents: graduatedCount,
        }
      };
    } catch (error) {
      this.logger.error(`Failed to fetch student statistics: ${error.message}`);
      throw new Error('Failed to fetch student statistics: ' + error.message);
    }
  }

  @Post('students/bulk-upload')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Bulk upload students via Excel/CSV' })
  @ApiResponse({ status: 201, description: 'Bulk student upload processed' })
  async bulkUploadStudents(@Request() req, @UploadedFile() file: any) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    if (!allowed.includes(file.mimetype)) {
      this.logger.warn(`Unsupported file type: ${file.mimetype}`);
      throw new Error('Unsupported file type. Upload .xlsx, .xls or .csv');
    }

    const result = await this.studentService.bulkCreateFromExcel(file.buffer, req.user?.schoolId);
    return {
      ...result,
      success: true,
    };
  }

  @Get('students/template')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Download student bulk upload template' })
  async downloadTemplate(@Res() res) {
    const headers = [
      'firstName', 'lastName', 'password', 'email', 'username', 'phoneNumber', 'address', 'dateOfBirth', 'gender', 'gradeLevel', 'class', 'parentId', 'studentId'
    ];
    const sampleRows = [
      // Form 1 Students (8 students)
      { firstName: 'John', lastName: 'Doe', password: 'Password123!', email: 'stu001@schomas.test', username: 'stu001', phoneNumber: '254700000001', address: '123 Main St', dateOfBirth: '2012-05-14', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU001' },
      { firstName: 'Grace', lastName: 'Wanjiru', password: 'Password123!', email: 'stu002@schomas.test', username: 'stu002', phoneNumber: '254700000002', address: 'Nakuru', dateOfBirth: '2012-11-23', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU002' },
      { firstName: 'Brian', lastName: 'Mwangi', password: 'Password123!', email: 'stu003@schomas.test', username: 'stu003', phoneNumber: '254700000003', address: 'Thika', dateOfBirth: '2012-09-30', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU003' },
      { firstName: 'Naomi', lastName: 'Chebet', password: 'Password123!', email: 'stu004@schomas.test', username: 'stu004', phoneNumber: '254700000004', address: 'Bomet', dateOfBirth: '2012-04-08', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU004' },
      { firstName: 'Kevin', lastName: 'Mutua', password: 'Password123!', email: 'stu005@schomas.test', username: 'stu005', phoneNumber: '254700000005', address: 'Machakos', dateOfBirth: '2012-07-19', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU005' },
      { firstName: 'Sarah', lastName: 'Waweru', password: 'Password123!', email: 'stu006@schomas.test', username: 'stu006', phoneNumber: '254700000006', address: 'Kiambu', dateOfBirth: '2012-03-15', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU006' },
      { firstName: 'David', lastName: 'Ochieng', password: 'Password123!', email: 'stu007@schomas.test', username: 'stu007', phoneNumber: '254700000007', address: 'Homa Bay', dateOfBirth: '2012-10-02', gender: 'Male', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU007' },
      { firstName: 'Lucy', lastName: 'Nyong', password: 'Password123!', email: 'stu008@schomas.test', username: 'stu008', phoneNumber: '254700000008', address: 'Kajiado', dateOfBirth: '2012-06-27', gender: 'Female', gradeLevel: 'Form 1', class: 'Form one', parentId: '', studentId: 'STU008' },

      // Form 2 Students (8 students)
      { firstName: 'Mary', lastName: 'Kamau', password: 'Password123!', email: 'stu009@schomas.test', username: 'stu009', phoneNumber: '254700000009', address: 'Nairobi', dateOfBirth: '2011-09-01', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU009' },
      { firstName: 'Peter', lastName: 'Otieno', password: 'Password123!', email: 'stu010@schomas.test', username: 'stu010', phoneNumber: '254700000010', address: 'Kisumu', dateOfBirth: '2011-03-05', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU010' },
      { firstName: 'Faith', lastName: 'Njeri', password: 'Password123!', email: 'stu011@schomas.test', username: 'stu011', phoneNumber: '254700000011', address: 'Nyeri', dateOfBirth: '2011-12-12', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU011' },
      { firstName: 'Michael', lastName: 'Kiprop', password: 'Password123!', email: 'stu012@schomas.test', username: 'stu012', phoneNumber: '254700000012', address: 'Nandi', dateOfBirth: '2011-08-18', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU012' },
      { firstName: 'Joyce', lastName: 'Waithera', password: 'Password123!', email: 'stu013@schomas.test', username: 'stu013', phoneNumber: '254700000013', address: 'Murang\'a', dateOfBirth: '2011-04-25', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU013' },
      { firstName: 'James', lastName: 'Koech', password: 'Password123!', email: 'stu014@schomas.test', username: 'stu014', phoneNumber: '254700000014', address: 'Uasin Gishu', dateOfBirth: '2011-11-09', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU014' },
      { firstName: 'Alice', lastName: 'Muthoni', password: 'Password123!', email: 'stu015@schomas.test', username: 'stu015', phoneNumber: '254700000015', address: 'Kirinyaga', dateOfBirth: '2011-01-14', gender: 'Female', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU015' },
      { firstName: 'Emmanuel', lastName: 'Wekesa', password: 'Password123!', email: 'stu016@schomas.test', username: 'stu016', phoneNumber: '254700000016', address: 'Bungoma', dateOfBirth: '2011-06-30', gender: 'Male', gradeLevel: 'Form 2', class: 'Form two', parentId: '', studentId: 'STU016' },

      // Form 3 Students (8 students)
      { firstName: 'Ali', lastName: 'Hassan', password: 'Password123!', email: 'stu017@schomas.test', username: 'stu017', phoneNumber: '254700000017', address: 'Mombasa', dateOfBirth: '2010-02-10', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU017' },
      { firstName: 'Linda', lastName: 'Achieng', password: 'Password123!', email: 'stu018@schomas.test', username: 'stu018', phoneNumber: '254700000018', address: 'Eldoret', dateOfBirth: '2010-07-18', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU018' },
      { firstName: 'Samuel', lastName: 'Kibet', password: 'Password123!', email: 'stu019@schomas.test', username: 'stu019', phoneNumber: '254700000019', address: 'Kericho', dateOfBirth: '2010-01-22', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU019' },
      { firstName: 'Mercy', lastName: 'Wanjiku', password: 'Password123!', email: 'stu020@schomas.test', username: 'stu020', phoneNumber: '254700000020', address: 'Embu', dateOfBirth: '2010-09-16', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU020' },
      { firstName: 'Victor', lastName: 'Mutiso', password: 'Password123!', email: 'stu021@schomas.test', username: 'stu021', phoneNumber: '254700000021', address: 'Kitui', dateOfBirth: '2010-05-12', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU021' },
      { firstName: 'Rose', lastName: 'Adhiambo', password: 'Password123!', email: 'stu022@schomas.test', username: 'stu022', phoneNumber: '254700000022', address: 'Siaya', dateOfBirth: '2010-12-07', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU022' },
      { firstName: 'Daniel', lastName: 'Kiptoo', password: 'Password123!', email: 'stu023@schomas.test', username: 'stu023', phoneNumber: '254700000023', address: 'Baringo', dateOfBirth: '2010-03-28', gender: 'Male', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU023' },
      { firstName: 'Esther', lastName: 'Nyambura', password: 'Password123!', email: 'stu024@schomas.test', username: 'stu024', phoneNumber: '254700000024', address: 'Nyandarua', dateOfBirth: '2010-08-13', gender: 'Female', gradeLevel: 'Form 3', class: 'Form Three', parentId: '', studentId: 'STU024' },

      // Form 4 Students (8 students)
      { firstName: 'Collins', lastName: 'Ongeri', password: 'Password123!', email: 'stu025@schomas.test', username: 'stu025', phoneNumber: '254700000025', address: 'Kisii', dateOfBirth: '2009-04-03', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU025' },
      { firstName: 'Catherine', lastName: 'Wambui', password: 'Password123!', email: 'stu026@schomas.test', username: 'stu026', phoneNumber: '254700000026', address: 'Laikipia', dateOfBirth: '2009-10-21', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU026' },
      { firstName: 'Francis', lastName: 'Macharia', password: 'Password123!', email: 'stu027@schomas.test', username: 'stu027', phoneNumber: '254700000027', address: 'Meru', dateOfBirth: '2009-01-17', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU027' },
      { firstName: 'Helen', lastName: 'Nafula', password: 'Password123!', email: 'stu028@schomas.test', username: 'stu028', phoneNumber: '254700000028', address: 'Kakamega', dateOfBirth: '2009-07-29', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU028' },
      { firstName: 'Robert', lastName: 'Kiprotich', password: 'Password123!', email: 'stu029@schomas.test', username: 'stu029', phoneNumber: '254700000029', address: 'Elgeyo Marakwet', dateOfBirth: '2009-05-08', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU029' },
      { firstName: 'Margaret', lastName: 'Wangari', password: 'Password123!', email: 'stu030@schomas.test', username: 'stu030', phoneNumber: '254700000030', address: 'Tharaka Nithi', dateOfBirth: '2009-11-24', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU030' },
      { firstName: 'Anthony', lastName: 'Ouma', password: 'Password123!', email: 'stu031@schomas.test', username: 'stu031', phoneNumber: '254700000031', address: 'Migori', dateOfBirth: '2009-02-15', gender: 'Male', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU031' },
      { firstName: 'Beatrice', lastName: 'Jebet', password: 'Password123!', email: 'stu032@schomas.test', username: 'stu032', phoneNumber: '254700000032', address: 'West Pokot', dateOfBirth: '2009-09-11', gender: 'Female', gradeLevel: 'Form 4', class: 'Form Four', parentId: '', studentId: 'STU032' }
    ];
    const worksheet = XLSX.utils.json_to_sheet(sampleRows as any[], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', 'attachment; filename="student-bulk-template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
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
  const newStudent = await this.studentService.createStudent(createStudentDto, req.user?.schoolId);

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
  async getTotalStudentsCount(
    @Request() req,
    @Query('activeOnly') activeOnly: boolean,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    this.logger.log(`Fetching total students count, activeOnly: ${activeOnly}`);
    try {
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
      
      const total = await this.studentService.getTotalStudentsCount(activeOnly, effectiveSchoolId, isSuper);

      // Calculate month-over-month trend
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const whereScope: any = {};
      if (!isSuper) {
        if (!effectiveSchoolId) {
          return { success: true, totalStudents: 0, activeOnly: activeOnly || false, schoolId: null, trend: { value: 0, isPositive: true, hasComparativeData: false } };
        }
        whereScope.schoolId = effectiveSchoolId;
      } else if (effectiveSchoolId) {
        whereScope.schoolId = effectiveSchoolId;
      }

      // Snapshot-based totals
      const [currentTotalSnapshot, previousTotalSnapshot] = await Promise.all([
        this.studentService.count({ ...whereScope }),
        this.studentService.count({ ...whereScope, createdAt: LessThanOrEqual(previousMonthEnd) as any }),
      ]);

      let trendValue = 0;
      let isPositive = true;
      let hasComparativeData = true;

      if (previousTotalSnapshot > 0) {
        trendValue = Math.round(((currentTotalSnapshot - previousTotalSnapshot) / previousTotalSnapshot) * 100);
        isPositive = trendValue >= 0;
      } else {
        // Always show a percentage even when there is no previous data
        if (currentTotalSnapshot > 0) {
          trendValue = 100;
          isPositive = true;
        } else {
          trendValue = 0;
          isPositive = true;
        }
      }

      return {
        success: true,
        totalStudents: total,
        activeOnly: activeOnly || false,
        schoolId: effectiveSchoolId,
        trend: { value: Math.abs(trendValue), isPositive, hasComparativeData: true },
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
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('form') form?: string,
    @Query('schoolId') schoolIdFilter?: string, // optional for super admin
  ) {
    this.logger.log(`Fetching students page=${page} limit=${limit} search=${search} form=${form}`);
    try {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      const effectiveSchoolId = isSuper ? (schoolIdFilter || req.user?.schoolId) : req.user?.schoolId;
      const [students, total] = await this.studentService.findAndCountScoped(
        { skip, take: limitNum, search, form },
        effectiveSchoolId,
        isSuper,
      );
      return {
        students,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
        },
        filters: { schoolId: effectiveSchoolId, search, form }
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
  async getStudent(@Param('id') id: string, @Request() req) {
    this.logger.log(`Fetching student with id: ${id}`);
    try {
      const student = await this.studentService.findOne(id);
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      if (!isSuper && student.schoolId && student.schoolId !== req.user?.schoolId) {
        throw new NotFoundException('Student not found');
      }
      return student;
    } catch (error) {
      this.logger.error(`Failed to fetch student: ${error.message}`);
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Student not found');
    }
  }

  @Get('by-class/:classId')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Get students by class ID' })
  @ApiResponse({ status: 200, description: 'Students in class retrieved successfully' })
  async getStudentsByClass(@Param('classId') classId: string, @Request() req) {
    this.logger.log(`Fetching students for class: ${classId}`);
    try {
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      const students = await this.studentService.findByClassId(classId, req.user?.schoolId, isSuper);
      return {
        success: true,
        students,
        count: students.length,
        classId
      };
    } catch (error) {
      this.logger.error(`Failed to fetch students for class ${classId}: ${error.message}`);
      throw new Error('Failed to fetch students for class: ' + error.message);
    }
  }

  @Get('class-counts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get student count by class' })
  @ApiResponse({ status: 200, description: 'Student counts by class retrieved successfully' })
  async getStudentCountsByClass(@Request() req) {
    this.logger.log('Fetching student counts by class');
    try {
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      const counts = await this.studentService.getStudentCountsByClass(req.user?.schoolId, isSuper);
      return {
        success: true,
        classCounts: counts
      };
    } catch (error) {
      this.logger.error(`Failed to fetch student counts by class: ${error.message}`);
      throw new Error('Failed to fetch student counts by class: ' + error.message);
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
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      if (!isSuper && originalStudent.schoolId && originalStudent.schoolId !== req.user?.schoolId) {
        throw new NotFoundException('Student not found');
      }
      
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

  // --- Activate / Deactivate student endpoints ---
  @Post('students/:id/deactivate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate a student' })
  async deactivateStudent(@Param('id') id: string, @Body() body: { reason?: string }, @Request() req) {
    this.logger.log(`Deactivating student with id: ${id}`);
    try {
      // Check scope
      const originalStudent = await this.studentService.findOne(id);
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      if (!isSuper && originalStudent.schoolId && originalStudent.schoolId !== req.user?.schoolId) {
        throw new NotFoundException('Student not found');
      }

      const updated = await this.studentService.setActive(id, false, { id: req.user?.sub, email: req.user?.email }, body?.reason);

      await this.systemLoggingService.logAction({
        action: 'STUDENT_DEACTIVATED',
        module: 'STUDENTS',
        level: 'warn',
        performedBy: { id: req.user?.sub, email: req.user?.email, role: req.user?.role, name: req.user?.username || req.user?.email },
        entityId: id,
        entityType: 'Student',
        oldValues: { isActive: originalStudent.isActive },
        newValues: { isActive: updated.isActive, inactivationReason: updated.inactivationReason },
        metadata: { description: `Student deactivated: ${updated.firstName} ${updated.lastName}` },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return { success: true, student: updated, message: 'Student deactivated' };
    } catch (error) {
      this.logger.error(`Failed to deactivate student: ${error.message}`);
      throw new Error('Failed to deactivate student: ' + error.message);
    }
  }

  @Post('students/:id/activate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Activate a student' })
  async activateStudent(@Param('id') id: string, @Request() req) {
    this.logger.log(`Activating student with id: ${id}`);
    try {
      const originalStudent = await this.studentService.findOne(id);
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      if (!isSuper && originalStudent.schoolId && originalStudent.schoolId !== req.user?.schoolId) {
        throw new NotFoundException('Student not found');
      }

      const updated = await this.studentService.setActive(id, true, { id: req.user?.sub, email: req.user?.email });

      await this.systemLoggingService.logAction({
        action: 'STUDENT_ACTIVATED',
        module: 'STUDENTS',
        level: 'info',
        performedBy: { id: req.user?.sub, email: req.user?.email, role: req.user?.role, name: req.user?.username || req.user?.email },
        entityId: id,
        entityType: 'Student',
        oldValues: { isActive: originalStudent.isActive },
        newValues: { isActive: updated.isActive },
        metadata: { description: `Student activated: ${updated.firstName} ${updated.lastName}` },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return { success: true, student: updated, message: 'Student activated' };
    } catch (error) {
      this.logger.error(`Failed to activate student: ${error.message}`);
      throw new Error('Failed to activate student: ' + error.message);
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
      const isSuper = req.user?.role === 'SUPER_ADMIN';
      if (!isSuper && studentToDelete.schoolId && studentToDelete.schoolId !== req.user?.schoolId) {
        throw new NotFoundException('Student not found');
      }
      
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