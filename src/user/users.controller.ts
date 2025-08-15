import {
    Controller,
    Post,
    Body,
    UseGuards,
    Get,
    Param,
    ParseUUIDPipe,
    Request,
  } from '@nestjs/common';
  import { CreateTeacherDto } from './dtos/create-teacher.dto';
  import { CreateStudentDto } from './dtos/create-student.dto';
  import { CreateParentDto } from './dtos/create-parent.dto';
  import { CreateFinanceDto } from './dtos/create-finance.dto';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { Roles } from './decorators/roles.decorator';
  import { Role } from './enums/role.enum';
  import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './user.service';
import { SystemLoggingService } from '../logs/system-logging.service';
  
  @Controller('users')
  export class UsersController {
    constructor(
      private readonly usersService: UsersService,
      private readonly systemLoggingService: SystemLoggingService,
    ) {}
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('teachers')
    async createTeacher(@Body() createTeacherDto: CreateTeacherDto, @Request() req) {
      try {
        const result = await this.usersService.createTeacher(createTeacherDto);
        
        // Log successful teacher creation
        await this.systemLoggingService.logAction({
          action: 'create_teacher_user',
          module: 'users',
          level: 'info',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin',
            name: req.user?.name || 'Admin User'
          },
          entityId: result.id,
          entityType: 'Teacher',
          newValues: {
            teacherId: result.id,
            firstName: result.firstName,
            lastName: result.lastName,
            phoneNumber: result.phoneNumber,
            qualification: result.qualification,
            subjectSpecialization: result.subjectSpecialization,
            status: result.status
          },
          metadata: {
            created_by_admin: req.user?.email || 'unknown',
            creation_timestamp: new Date().toISOString(),
            teacher_full_name: `${result.firstName} ${result.lastName}`
          }
        });
        
        return result;
      } catch (error) {
        // Log teacher creation error
        await this.systemLoggingService.logAction({
          action: 'create_teacher_user_error',
          module: 'users',
          level: 'error',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin'
          },
          entityType: 'Teacher',
          errorMessage: error.message,
          stackTrace: error.stack,
          metadata: {
            attempted_teacher_email: createTeacherDto.email,
            attempted_by_admin: req.user?.email || 'unknown',
            error_timestamp: new Date().toISOString()
          }
        });
        
        throw error;
      }
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('students')
    async createStudent(@Body() createStudentDto: CreateStudentDto, @Request() req) {
      try {
        const result = await this.usersService.createStudent(createStudentDto);
        
        // Log successful student creation
        await this.systemLoggingService.logAction({
          action: 'create_student_user',
          module: 'users',
          level: 'info',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin',
            name: req.user?.name || 'Admin User'
          },
          entityId: result.id,
          entityType: 'Student',
          newValues: {
            studentId: result.id,
            studentNumber: result.studentId,
            firstName: result.firstName,
            lastName: result.lastName,
            phoneNumber: result.phoneNumber,
            dateOfBirth: result.dateOfBirth,
            gender: result.gender,
            address: result.address,
            gradeLevel: result.gradeLevel,
            classId: result.classId
          },
          metadata: {
            created_by_admin: req.user?.email || 'unknown',
            creation_timestamp: new Date().toISOString(),
            student_full_name: `${result.firstName} ${result.lastName}`
          }
        });
        
        return result;
      } catch (error) {
        // Log student creation error
        await this.systemLoggingService.logAction({
          action: 'create_student_user_error',
          module: 'users',
          level: 'error',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin'
          },
          entityType: 'Student',
          errorMessage: error.message,
          stackTrace: error.stack,
          metadata: {
            attempted_student_email: createStudentDto.email,
            attempted_by_admin: req.user?.email || 'unknown',
            error_timestamp: new Date().toISOString()
          }
        });
        
        throw error;
      }
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('parents')
    async createParent(@Body() createParentDto: CreateParentDto, @Request() req) {
      try {
        const result = await this.usersService.createParent(createParentDto);
        
        // Log successful parent creation
        await this.systemLoggingService.logAction({
          action: 'create_parent_user',
          module: 'users',
          level: 'info',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin',
            name: req.user?.name || 'Admin User'
          },
          entityId: result.id,
          entityType: 'Parent',
          newValues: {
            parentId: result.id,
            firstName: result.firstName,
            lastName: result.lastName,
            phoneNumber: result.phoneNumber,
            address: result.address,
            occupation: result.occupation
            // removed relationship as it does not exist on Parent
          },
          metadata: {
            created_by_admin: req.user?.email || 'unknown',
            creation_timestamp: new Date().toISOString(),
            parent_full_name: `${result.firstName} ${result.lastName}`
          }
        });
        
        return result;
      } catch (error) {
        // Log parent creation error
        await this.systemLoggingService.logAction({
          action: 'create_parent_user_error',
          module: 'users',
          level: 'error',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin'
          },
          entityType: 'Parent',
          errorMessage: error.message,
          stackTrace: error.stack,
          metadata: {
            attempted_parent_email: createParentDto.email,
            attempted_by_admin: req.user?.email || 'unknown',
            error_timestamp: new Date().toISOString()
          }
        });
        
        throw error;
      }
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('finance')
    async createFinance(@Body() createFinanceDto: CreateFinanceDto, @Request() req) {
      try {
        const result = await this.usersService.createFinance(createFinanceDto);
        
        // Log successful finance user creation
        await this.systemLoggingService.logAction({
          action: 'create_finance_user',
          module: 'users',
          level: 'info',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin',
            name: req.user?.name || 'Admin User'
          },
          entityId: result.id,
          entityType: 'Finance',
          newValues: {
            financeUserId: result.id,
            firstName: result.firstName,
            lastName: result.lastName,
            phoneNumber: result.phoneNumber,
            address: result.address,
            department: result.department,
            canApproveBudgets: result.canApproveBudgets,
            canProcessPayments: result.canProcessPayments
          },
          metadata: {
            created_by_admin: req.user?.email || 'unknown',
            creation_timestamp: new Date().toISOString(),
            finance_user_full_name: `${result.firstName} ${result.lastName}`
          }
        });
        
        return result;
      } catch (error) {
        // Log finance user creation error
        await this.systemLoggingService.logAction({
          action: 'create_finance_user_error',
          module: 'users',
          level: 'error',
          performedBy: {
            id: req.user?.sub,
            email: req.user?.email || 'unknown',
            role: 'admin'
          },
          entityType: 'Finance',
          errorMessage: error.message,
          stackTrace: error.stack,
          metadata: {
            attempted_finance_email: createFinanceDto.email,
            attempted_by_admin: req.user?.email || 'unknown',
            error_timestamp: new Date().toISOString()
          }
        });
        
        throw error;
      }
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Get('teachers')
    findAllTeachers() {
      return this.usersService.findAllTeachers();
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Get('students')
    findAllStudents() {
      return this.usersService.findAllStudents();
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Get('parents')
    findAllParents() {
      return this.usersService.findAllParents();
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Get('finance')
    findAllFinance() {
      return this.usersService.findAllFinance();
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
      return this.usersService.findById(id);
    }
  }