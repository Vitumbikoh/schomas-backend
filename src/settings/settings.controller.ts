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
  BadRequestException,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SystemLoggingService } from 'src/logs/system-logging.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  SettingsResponseDto,
  UpdateSettingsDto,
  AcademicCalendarDto,
  PeriodDto,
} from './dtos/settings.dto';
import { AcademicCalendar } from './entities/academic-calendar.entity';
import { Period } from './entities/period.entity';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AcademicCalendarUtils } from './utils/academic-calendar.utils';
import { CreateTermPeriodDto, TermPeriodDto } from './dtos/term-period.dto';

@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
    private readonly systemLoggingService: SystemLoggingService,
    @InjectRepository(AcademicCalendar)
    private readonly academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(Period)
    private readonly periodRepository: Repository<Period>,
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
        term: dto.term,
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
        term: savedCalendar.term,
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
        term: '',
        startDate: '',
        endDate: '',
      };
    }

    return {
      term: academicCalendar.term,
      startDate: academicCalendar.startDate?.toISOString(),
      endDate: academicCalendar.endDate?.toISOString(),
    };
  }

  // Period Endpoints
  @UseGuards(JwtAuthGuard)
  @Post('periods')
  async createPeriod(@Request() req, @Body() dto: PeriodDto): Promise<PeriodDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can create periods');
    }
    const created = await this.settingsService.createPeriod(dto);
    await this.systemLoggingService.logAction({
      action: 'PERIOD_CREATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: created.id,
      entityType: 'Period',
      newValues: created as any
    });
    return created;
  }

  @UseGuards(JwtAuthGuard)
  @Get('periods')
  async getPeriods(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ): Promise<PeriodDto[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access periods');
    }
    return this.settingsService.getPeriods(academicCalendarId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('periods/:id')
  async updatePeriod(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PeriodDto,
  ): Promise<PeriodDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can update periods');
    }
    const before = await this.periodRepository.findOne({ where: { id } });
    const updated = await this.settingsService.updatePeriod(id, dto);
    await this.systemLoggingService.logAction({
      action: 'PERIOD_UPDATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: id,
      entityType: 'Period',
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
      term: calendar.term,
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

    try {
      // Use the service method which includes student promotion logic
      const updatedCalendar = await this.settingsService.activateAcademicCalendar(id, req.user.schoolId);

      // Log the action
      await this.systemLoggingService.logAction({
        action: 'ACADEMIC_CALENDAR_ACTIVATED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
        entityId: updatedCalendar.id,
        entityType: 'AcademicCalendar',
        newValues: updatedCalendar as any
      });

      return updatedCalendar;
    } catch (error) {
      this.logger.error('Failed to activate academic calendar', error.stack);
      
      if (error instanceof NotFoundException || error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to activate academic calendar');
    }
  }

   @UseGuards(JwtAuthGuard)
  @Get('periods/available')
  async getAvailablePeriods(@Request() req): Promise<Period[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access periods');
    }
    return this.settingsService.getAvailablePeriods();
  }

  @UseGuards(JwtAuthGuard)
@Post('periods/term')
async createTermPeriod(
  @Request() req,
  @Body() dto: CreateTermPeriodDto,
): Promise<TermPeriodDto> {
  if (req.user.role !== 'ADMIN') {
    throw new UnauthorizedException('Only admins can create term periods');
  }
  const created = await this.settingsService.createTermPeriod(dto);
  await this.systemLoggingService.logAction({
    action: 'Term_PERIOD_CREATED',
    module: 'SETTINGS',
    level: 'info',
    performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
    entityId: created.id,
    entityType: 'TermPeriod',
    newValues: created as any
  });
  return created;
}

  @UseGuards(JwtAuthGuard)
  @Get('periods/term')
  async getTermPeriods(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ): Promise<TermPeriodDto[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access term periods');
    }
    return this.settingsService.getTermPeriods(academicCalendarId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('periods/term/:id/activate')
  async activateTermPeriod(
    @Request() req,
    @Param('id') id: string,
  ): Promise<TermPeriodDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can activate term periods');
    }
    const updated = await this.settingsService.activateTermPeriod(id);
    await this.systemLoggingService.logAction({
      action: 'Term_PERIOD_ACTIVATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: updated.id,
      entityType: 'TermPeriod',
      newValues: updated as any
    });
    return updated;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('periods/term/:id')
  async updateTermPeriod(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: CreateTermPeriodDto,
  ): Promise<TermPeriodDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can update term periods');
    }
    const updated = await this.settingsService.updateTermPeriod(id, updateDto);
    await this.systemLoggingService.logAction({
      action: 'TERM_PERIOD_UPDATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: updated.id,
      entityType: 'TermPeriod',
      newValues: updated as any
    });
    return updated;
  }

  // List terms (period instances) for a calendar (or active calendar if none provided)
  @UseGuards(JwtAuthGuard)
  @Get('terms')
  async listTerms(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    if (!['ADMIN','FINANCE'].includes(req.user.role)) {
      throw new UnauthorizedException('Only admins or finance can access terms');
    }
    return this.settingsService.getTerms(academicCalendarId);
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
      term: activeCalendar.term,
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
      // Use the service method which includes student promotion logic
      const updatedCalendar = await this.settingsService.activateAcademicCalendar(id, req.user.schoolId);

      // Log the action
      await this.systemLoggingService.logAction({
        action: 'ACADEMIC_CALENDAR_ACTIVATED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
        entityId: updatedCalendar.id,
        entityType: 'AcademicCalendar',
        metadata: { 
          description: `Academic calendar ${updatedCalendar.term} set as active`,
          schoolId: req.user.schoolId 
        }
      });

      return {
        success: true,
        message: `Academic calendar for ${updatedCalendar.term} is now active`,
        activeCalendar: updatedCalendar
      };
    } catch (error) {
      this.logger.error(`Error setting active academic calendar: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to set active academic calendar');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('term/:id/complete')
  async completeTerm(
    @Request() req,
    @Param('id') TermId: string,
  ): Promise<{
    success: boolean;
    message: string;
    calendarCompleted?: boolean;
    nextYearActivated?: boolean;
  }> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can complete terms');
    }

    if (!req.user.schoolId) {
      throw new UnauthorizedException('Administrator must be associated with a school');
    }

    try {
      const result = await this.settingsService.completeTerm(TermId, req.user.schoolId);

      // Log the action
      await this.systemLoggingService.logAction({
        action: 'Term_COMPLETED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
        entityId: TermId,
        entityType: 'Term',
        metadata: { 
          description: `Term completed`,
          schoolId: req.user.schoolId,
          calendarCompleted: result.calendarCompleted,
          nextYearActivated: result.nextYearActivated
        }
      });

      return result;
    } catch (error) {
      this.logger.error(`Error completing term: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to complete term');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('calendar-completion-status')
  async getCalendarCompletionStatus(@Request() req) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can view calendar completion status');
    }

    if (!req.user.schoolId) {
      throw new UnauthorizedException('Administrator must be associated with a school');
    }

    try {
      return await this.settingsService.getCalendarCompletionStatus(req.user.schoolId);
    } catch (error) {
      this.logger.error(`Error getting calendar completion status: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to get calendar completion status');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('can-activate-calendar/:id')
  async canActivateNewCalendar(
    @Request() req,
    @Param('id') newCalendarId: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can check calendar activation');
    }

    if (!req.user.schoolId) {
      throw new UnauthorizedException('Administrator must be associated with a school');
    }

    try {
      return await this.settingsService.canActivateNewCalendar(req.user.schoolId, newCalendarId);
    } catch (error) {
      this.logger.error(`Error checking calendar activation: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to check calendar activation');
    }
  }

  // Student Promotion Endpoints

}
