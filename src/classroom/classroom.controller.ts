import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    ParseUUIDPipe,
  } from '@nestjs/common';

  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';

  import { ApiBearerAuth, ApiTags, ApiResponse } from '@nestjs/swagger';
import { ClassroomService } from './classroom.service';
import { ClassroomResponseDto, CreateClassroomDto, UpdateClassroomDto } from './dtos/classroom.dto';
import { Roles } from 'src/user/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';
  
  @ApiTags('Classroom')
  @ApiBearerAuth()
  @Controller('classrooms')
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class ClassroomController {
    constructor(private readonly classroomService: ClassroomService) {}
  
    @Post()
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Classroom created', type: ClassroomResponseDto })
    async create(@Body() createClassroomDto: CreateClassroomDto): Promise<ClassroomResponseDto> {
      return this.classroomService.create(createClassroomDto);
    }
  
    @Get()
    @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
    @ApiResponse({ status: 200, description: 'List of classrooms', type: [ClassroomResponseDto] })
    async findAll(
      @Query('isActive') isActive?: boolean,
      @Query('building') building?: string,
    ): Promise<ClassroomResponseDto[]> {
      return this.classroomService.findAll({ isActive, building });
    }
  
    @Get(':id')
    @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
    @ApiResponse({ status: 200, description: 'Classroom details', type: ClassroomResponseDto })
    async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ClassroomResponseDto> {
      return this.classroomService.findOne(id);
    }
  
    @Put(':id')
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Classroom updated', type: ClassroomResponseDto })
    async update(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() updateClassroomDto: UpdateClassroomDto,
    ): Promise<ClassroomResponseDto> {
      return this.classroomService.update(id, updateClassroomDto);
    }
  
    @Delete(':id')
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Classroom deleted' })
    async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
      return this.classroomService.remove(id);
    }
  
    @Get('building/:buildingName')
    @Roles(Role.ADMIN, Role.TEACHER, Role.STUDENT)
    @ApiResponse({ status: 200, description: 'Classrooms in building', type: [ClassroomResponseDto] })
    async findByBuilding(@Param('buildingName') buildingName: string): Promise<ClassroomResponseDto[]> {
      return this.classroomService.findByBuilding(buildingName);
    }
  
    @Get('available/:date/:time')
    @Roles(Role.ADMIN, Role.TEACHER)
    @ApiResponse({ status: 200, description: 'Available classrooms', type: [ClassroomResponseDto] })
    async findAvailable(
      @Param('date') date: string,
      @Param('time') time: string,
    ): Promise<ClassroomResponseDto[]> {
      return this.classroomService.findAvailable(date, time);
    }
  }