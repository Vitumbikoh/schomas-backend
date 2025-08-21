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
import { SystemLoggingService } from 'src/logs/system-logging.service';
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
  private readonly systemLoggingService: SystemLoggingService,
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

    // Check if user is trying to update school settings
    if (updateDto.schoolSettings) {
      if (req.user.role !== 'ADMIN') {
        throw new UnauthorizedException('Only school administrators can update school settings');
      }
      if (!req.user.schoolId) {
        throw new UnauthorizedException('Administrator must be associated with a school to update school settings');
      }
    }

    const before = await this.settingsService.getSettings(req.user.sub);
    const updated = await this.settingsService.updateSettings(req.user.sub, updateDto);
    await this.systemLoggingService.logAction({
      action: 'SETTINGS_UPDATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityType: 'Settings',
      oldValues: before as any,
      newValues: updated as any,
      metadata: { description: 'System settings updated' }
    });
    return updated;
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

    if (!req.user.schoolId) {
      throw new UnauthorizedException(
        'Administrator must be associated with a school to create academic calendars',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First deactivate all other calendars for this school if this one should be active
      if (dto.isActive) {
        await queryRunner.manager.update(
          AcademicCalendar,
          { schoolId: req.user.schoolId, isActive: true },
          { isActive: false },
        );
      }

      const calendarData = {
        academicYear: dto.academicYear,
        schoolId: req.user.schoolId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isActive: dto.isActive ?? false,
      };

      const savedCalendar = await queryRunner.manager.save(
        AcademicCalendar,
        calendarData,
      );

      await queryRunner.commitTransaction();

      const response = {
        id: savedCalendar.id,
        academicYear: savedCalendar.academicYear,
        startDate: savedCalendar.startDate?.toISOString(),
        endDate: savedCalendar.endDate?.toISOString(),
        isActive: savedCalendar.isActive,
      };
      await this.systemLoggingService.logAction({
        action: 'ACADEMIC_CALENDAR_CREATED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
        entityId: savedCalendar.id,
        entityType: 'AcademicCalendar',
        newValues: response as any,
        metadata: { description: 'Academic calendar created' }
      });
      return response;
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
    const created = await this.settingsService.createTerm(dto);
    await this.systemLoggingService.logAction({
      action: 'TERM_CREATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: created.id,
      entityType: 'Term',
      newValues: created as any
    });
    return created;
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
    const before = await this.termRepository.findOne({ where: { id } });
    const updated = await this.settingsService.updateTerm(id, dto);
    await this.systemLoggingService.logAction({
      action: 'TERM_UPDATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: id,
      entityType: 'Term',
      oldValues: before as any,
      newValues: updated as any
    });
    return updated;
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

    if (!req.user.schoolId) {
      throw new UnauthorizedException(
        'Administrator must be associated with a school to access academic calendars',
      );
    }

    const calendars = await this.academicCalendarRepository.find({
      where: { schoolId: req.user.schoolId },
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

    if (!req.user.schoolId) {
      throw new UnauthorizedException(
        'Administrator must be associated with a school to manage academic calendars',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First check if the calendar belongs to the admin's school
      const calendar = await queryRunner.manager.findOne(AcademicCalendar, {
        where: { id, schoolId: req.user.schoolId },
      });

      if (!calendar) {
        throw new NotFoundException('Academic calendar not found for your school');
      }

      // Deactivate all other calendars for this school only
      await queryRunner.manager.update(
        AcademicCalendar,
        { schoolId: req.user.schoolId, isActive: true },
        { isActive: false },
      );

      // Then activate the selected one
      calendar.isActive = true;
      const updatedCalendar = await queryRunner.manager.save(
        AcademicCalendar,
        calendar,
      );

      await queryRunner.commitTransaction();

      const response = {
        id: updatedCalendar.id,
        academicYear: updatedCalendar.academicYear,
        startDate: updatedCalendar.startDate?.toISOString(),
        endDate: updatedCalendar.endDate?.toISOString(),
        isActive: updatedCalendar.isActive,
      };
      await this.systemLoggingService.logAction({
        action: 'ACADEMIC_CALENDAR_ACTIVATED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
        entityId: updatedCalendar.id,
        entityType: 'AcademicCalendar',
        newValues: response as any
      });
      return response;
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
  const created = await this.settingsService.createAcademicYearTerm(dto);
  await this.systemLoggingService.logAction({
    action: 'ACADEMIC_YEAR_TERM_CREATED',
    module: 'SETTINGS',
    level: 'info',
    performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
    entityId: created.id,
    entityType: 'AcademicYearTerm',
    newValues: created as any
  });
  return created;
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
    const updated = await this.settingsService.activateAcademicYearTerm(id);
    await this.systemLoggingService.logAction({
      action: 'ACADEMIC_YEAR_TERM_ACTIVATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: updated.id,
      entityType: 'AcademicYearTerm',
      newValues: updated as any
    });
    return updated;
  }

  // List academic years (term instances) for a calendar (or active calendar if none provided)
  @UseGuards(JwtAuthGuard)
  @Get('academic-years')
  async listAcademicYears(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    if (!['ADMIN','FINANCE'].includes(req.user.role)) {
      throw new UnauthorizedException('Only admins or finance can access academic years');
    }
    return this.settingsService.getAcademicYears(academicCalendarId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-academic-calendar')
  async getActiveAcademicCalendar(
    @Request() req,
  ): Promise<AcademicCalendarDto | null> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can access academic calendar');
    }

    if (!req.user.schoolId) {
      throw new UnauthorizedException('Administrator must be associated with a school');
    }

    const activeCalendar = await this.academicCalendarRepository.findOne({
      where: { schoolId: req.user.schoolId, isActive: true },
    });

    if (!activeCalendar) {
      return null;
    }

    return {
      id: activeCalendar.id,
      academicYear: activeCalendar.academicYear,
      startDate: activeCalendar.startDate ? new Date(activeCalendar.startDate).toISOString() : undefined,
      endDate: activeCalendar.endDate ? new Date(activeCalendar.endDate).toISOString() : undefined,
      isActive: activeCalendar.isActive,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('set-active-academic-calendar/:id')
  async setActiveAcademicCalendar(
    @Request() req,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string; activeCalendar?: AcademicCalendarDto }> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can set active academic calendar');
    }

    if (!req.user.schoolId) {
      throw new UnauthorizedException('Administrator must be associated with a school');
    }

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Verify the calendar belongs to the admin's school
        const calendar = await queryRunner.manager.findOne(AcademicCalendar, {
          where: { id, schoolId: req.user.schoolId },
        });

        if (!calendar) {
          throw new NotFoundException('Academic calendar not found for your school');
        }

        // Deactivate all other calendars for this school
        await queryRunner.manager.update(
          AcademicCalendar,
          { schoolId: req.user.schoolId, isActive: true },
          { isActive: false },
        );

        // Activate the selected calendar
        calendar.isActive = true;
        const updatedCalendar = await queryRunner.manager.save(AcademicCalendar, calendar);

        await queryRunner.commitTransaction();

        // Log the action
        await this.systemLoggingService.logAction({
          action: 'ACADEMIC_CALENDAR_ACTIVATED',
          module: 'SETTINGS',
          level: 'info',
          performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
          entityId: updatedCalendar.id,
          entityType: 'AcademicCalendar',
          metadata: { 
            description: `Academic calendar ${updatedCalendar.academicYear} set as active`,
            schoolId: req.user.schoolId 
          }
        });

        return {
          success: true,
          message: `Academic calendar for ${updatedCalendar.academicYear} is now active`,
          activeCalendar: {
            id: updatedCalendar.id,
            academicYear: updatedCalendar.academicYear,
            startDate: updatedCalendar.startDate ? new Date(updatedCalendar.startDate).toISOString() : undefined,
            endDate: updatedCalendar.endDate ? new Date(updatedCalendar.endDate).toISOString() : undefined,
            isActive: updatedCalendar.isActive,
          }
        };
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error(`Error setting active academic calendar: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to set active academic calendar');
    }
  }

}
