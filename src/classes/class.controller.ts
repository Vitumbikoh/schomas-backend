import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Get,
  Request,
  Query,
} from '@nestjs/common';
import { ClassService } from './class.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ClassResponseDto, CreateClassDto } from './dtos/class.dto';
import { Role } from 'src/user/enums/role.enum';

@Controller('classes')
export class ClassController {
  constructor(
    private readonly classService: ClassService,
    private readonly systemLoggingService: SystemLoggingService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true })) // Add this decorator
  async createClass(@Body() createClassDto: CreateClassDto, @Request() req) {
    const schoolId = req.user?.schoolId;
    const created = await this.classService.createClass(createClassDto, schoolId);
    await this.systemLoggingService.logAction({
      action: 'CLASS_CREATED',
      module: 'CLASS',
      level: 'info',
      entityId: created.id,
      entityType: 'Class',
      newValues: created as any
    });
    return created;
  }

  @Get()
  async getAllClasses(@Request() req, @Query('schoolId') schoolIdOverride?: string): Promise<ClassResponseDto[]> {
    const isSuper = req.user?.role === Role.SUPER_ADMIN;
    const isAdmin = req.user?.role === Role.ADMIN;
    const isElevated = isSuper || isAdmin;
    
    // For super admin, allow schoolId override; for regular admin, use their schoolId
    const schoolScope = isSuper ? (schoolIdOverride || req.user?.schoolId) : req.user?.schoolId;
    
    return this.classService.getAllClasses(schoolScope, isElevated);
  }
}
