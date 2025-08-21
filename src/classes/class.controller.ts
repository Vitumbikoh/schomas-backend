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
} from '@nestjs/common';
import { ClassService } from './class.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ClassResponseDto, CreateClassDto } from './dtos/class.dto';

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
  async getAllClasses(@Request() req): Promise<ClassResponseDto[]> {
    return this.classService.getAllClasses(req.user?.schoolId);
  }
}
