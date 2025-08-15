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
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { ClassroomResponseDto, CreateClassroomDto, UpdateClassroomDto } from './dtos/classroom.dto';
import { Roles } from 'src/user/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';
  
  @ApiTags('Classroom')
  @ApiBearerAuth()
  @Controller('classrooms')
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class ClassroomController {
    constructor(
      private readonly classroomService: ClassroomService,
      private readonly systemLoggingService: SystemLoggingService,
    ) {}
  
    @Post()
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Classroom created', type: ClassroomResponseDto })
    async create(@Body() createClassroomDto: CreateClassroomDto): Promise<ClassroomResponseDto> {
      const created = await this.classroomService.create(createClassroomDto);
      await this.systemLoggingService.logAction({
        action: 'CLASSROOM_CREATED',
        module: 'CLASSROOM',
        level: 'info',
        entityId: created.id,
        entityType: 'Classroom',
        newValues: created as any
      });
      return created;
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
      const before = await this.classroomService.findOne(id);
      const updated = await this.classroomService.update(id, updateClassroomDto);
      await this.systemLoggingService.logAction({
        action: 'CLASSROOM_UPDATED',
        module: 'CLASSROOM',
        level: 'info',
        entityId: id,
        entityType: 'Classroom',
        oldValues: before as any,
        newValues: updated as any
      });
      return updated;
    }
  
    @Delete(':id')
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Classroom deleted' })
    async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
      const before = await this.classroomService.findOne(id);
      await this.classroomService.remove(id);
      await this.systemLoggingService.logAction({
        action: 'CLASSROOM_DELETED',
        module: 'CLASSROOM',
        level: 'info',
        entityId: id,
        entityType: 'Classroom',
        oldValues: before as any
      });
      return;
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