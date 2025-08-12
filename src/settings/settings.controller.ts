import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
  Logger,
  Post,
  Delete,
  Param,
  ParseUUIDPipe,
  Query,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  SettingsResponseDto,
  UpdateSettingsDto,
  AcademicCalendarDto,
  TermDto,
} from './dtos/settings.dto';
import { AcademicCalendar } from './entities/academic-calendar.entity';
import { Term } from './entities/term.entity';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AcademicYearTermDto, CreateAcademicYearTermDto } from './dtos/academic-year-term.dto';

@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
    @InjectRepository(AcademicCalendar)
    private readonly academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(Term)
    private readonly termRepository: Repository<Term>,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getSettings(@Request() req): Promise<SettingsResponseDto> {
    this.logger.log('GET /settings request received');

    try {
      // Validate user
      if (!req.user?.sub) {
        this.logger.warn('Unauthorized request - no user sub');
        throw new UnauthorizedException('Invalid user credentials');
      }

      this.logger.debug(`Fetching settings for user: ${req.user.sub}`);

      // Get settings
      const settings = await this.settingsService.getSettings(req.user.sub);

      this.logger.debug('Settings retrieved successfully');
      return settings;
    } catch (error) {
      this.logger.error(
        `Error in GET /settings: ${error.message}`,
        error.stack,
      );

      // Handle specific errors
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof NotFoundException) {
        throw error;
      }

      // For other errors, return a 500 with more details
      throw new InternalServerErrorException({
        message: 'Failed to retrieve settings',
        error: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateSettings(
    @Request() req,
    @Body() updateDto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    if (!req.user || !req.user.sub) {
      throw new UnauthorizedException('Invalid user credentials');
    }
    return this.settingsService.updateSettings(req.user.sub, updateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('academic-calendar')
  async createAcademicCalendar(
    @Request() req,
    @Body() dto: AcademicCalendarDto,
  ): Promise<AcademicCalendarDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException(
        'Only admins can create academic calendars',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First deactivate all other calendars if this one should be active
      if (dto.isActive) {
        await queryRunner.manager.update(
          AcademicCalendar,
          { isActive: true },
          { isActive: false },
        );
      }

      const calendarData = {
        academicYear: dto.academicYear,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isActive: dto.isActive ?? false,
      };

      const savedCalendar = await queryRunner.manager.save(
        AcademicCalendar,
        calendarData,
      );

      await queryRunner.commitTransaction();

      return {
        id: savedCalendar.id,
        academicYear: savedCalendar.academicYear,
        startDate: savedCalendar.startDate?.toISOString(),
        endDate: savedCalendar.endDate?.toISOString(),
        isActive: savedCalendar.isActive,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create academic calendar', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('academic-calendar')
  async getAcademicCalendars(@Request() req): Promise<AcademicCalendarDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException(
        'Only admins can access academic calendars',
      );
    }

    const academicCalendar = await this.academicCalendarRepository.findOne({
      order: { createdAt: 'DESC' },
    });

    if (!academicCalendar) {
      return {
        academicYear: '',
        startDate: '',
        endDate: '',
      };
    }

    return {
      academicYear: academicCalendar.academicYear,
      startDate: academicCalendar.startDate?.toISOString(),
      endDate: academicCalendar.endDate?.toISOString(),
    };
  }

  // Term Endpoints
  @UseGuards(JwtAuthGuard)
  @Post('terms')
  async createTerm(@Request() req, @Body() dto: TermDto): Promise<TermDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can create terms');
    }
    return this.settingsService.createTerm(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('terms')
  async getTerms(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ): Promise<TermDto[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access terms');
    }
    return this.settingsService.getTerms(academicCalendarId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('terms/:id')
  async updateTerm(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TermDto,
  ): Promise<TermDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can update terms');
    }
    return this.settingsService.updateTerm(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('academic-calendars')
  async getAllAcademicCalendars(
    @Request() req,
  ): Promise<AcademicCalendarDto[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException(
        'Only admins can access academic calendars',
      );
    }

    const calendars = await this.academicCalendarRepository.find({
      order: { createdAt: 'DESC' },
    });

    return calendars.map((calendar) => ({
      id: calendar.id,
      academicYear: calendar.academicYear,
      startDate: calendar.startDate
        ? new Date(calendar.startDate).toISOString()
        : undefined,
      endDate: calendar.endDate
        ? new Date(calendar.endDate).toISOString()
        : undefined,
      isActive: calendar.isActive,
    }));
  }
  @UseGuards(JwtAuthGuard)
  @Patch('academic-calendar/:id/activate')
  async activateAcademicCalendar(
    @Request() req,
    @Param('id') id: string,
  ): Promise<AcademicCalendarDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException(
        'Only admins can activate academic calendars',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First deactivate all other calendars
      await queryRunner.manager.update(
        AcademicCalendar,
        { isActive: true },
        { isActive: false },
      );

      // Then activate the selected one
      const calendar = await queryRunner.manager.findOneBy(AcademicCalendar, {
        id,
      });

      if (!calendar) {
        throw new NotFoundException('Academic calendar not found');
      }

      calendar.isActive = true;
      const updatedCalendar = await queryRunner.manager.save(
        AcademicCalendar,
        calendar,
      );

      await queryRunner.commitTransaction();

      return {
        id: updatedCalendar.id,
        academicYear: updatedCalendar.academicYear,
        startDate: updatedCalendar.startDate?.toISOString(),
        endDate: updatedCalendar.endDate?.toISOString(),
        isActive: updatedCalendar.isActive,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to activate academic calendar', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

   @UseGuards(JwtAuthGuard)
  @Get('terms/available')
  async getAvailableTerms(@Request() req): Promise<Term[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access terms');
    }
    return this.settingsService.getAvailableTerms();
  }

  @UseGuards(JwtAuthGuard)
@Post('terms/academic-year')
async createAcademicYearTerm(
  @Request() req,
  @Body() dto: CreateAcademicYearTermDto,
): Promise<AcademicYearTermDto> {
  if (req.user.role !== 'ADMIN') {
    throw new UnauthorizedException('Only admins can create academic year terms');
  }
  return this.settingsService.createAcademicYearTerm(dto);
}

  @UseGuards(JwtAuthGuard)
  @Get('terms/academic-year')
  async getAcademicYearTerms(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ): Promise<AcademicYearTermDto[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access academic year terms');
    }
    return this.settingsService.getAcademicYearTerms(academicCalendarId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('terms/academic-year/:id/activate')
  async activateAcademicYearTerm(
    @Request() req,
    @Param('id') id: string,
  ): Promise<AcademicYearTermDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can activate academic year terms');
    }
    return this.settingsService.activateAcademicYearTerm(id);
  }

}
