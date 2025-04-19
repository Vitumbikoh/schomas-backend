import {
    Controller,
    Post,
    Body,
    UseGuards,
    Get,
    Param,
    ParseUUIDPipe,
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
  
  @Controller('users')
  export class UsersController {
    constructor(private readonly usersService: UsersService) {}
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('teachers')
    createTeacher(@Body() createTeacherDto: CreateTeacherDto) {
      return this.usersService.createTeacher(createTeacherDto);
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('students')
    createStudent(@Body() createStudentDto: CreateStudentDto) {
      return this.usersService.createStudent(createStudentDto);
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('parents')
    createParent(@Body() createParentDto: CreateParentDto) {
      return this.usersService.createParent(createParentDto);
    }
  
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post('finance')
    createFinance(@Body() createFinanceDto: CreateFinanceDto) {
      return this.usersService.createFinance(createFinanceDto);
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