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
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';
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
import { User } from '../user/entities/user.entity';
import { AcademicCalendarClosureDto } from './dtos/academic-calendar.dto';
import { CreateTermHolidayDto, UpdateTermHolidayDto } from './dtos/term-holiday.dto';

@ApiTags('settings')
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
        isCompleted: savedCalendar.isCompleted,
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
      isCompleted: academicCalendar.isCompleted,
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

  // --- Term Exam Lifecycle ---
  @UseGuards(JwtAuthGuard)
  @Post('terms/:termId/enter-exam-period')
  async enterExamPeriod(
    @Request() req,
    @Param('termId', ParseUUIDPipe) termId: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can start exam period');
    }
    if (!req.user.schoolId) {
      throw new UnauthorizedException('Missing school scope');
    }
    const result = await this.settingsService.enterExamPeriod(termId, req.user.schoolId);
    await this.systemLoggingService.logAction({
      action: 'TERM_ENTER_EXAM_PERIOD',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: termId,
      entityType: 'Term',
      newValues: result as any,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('terms/:termId/publish-results')
  async publishTermResults(
    @Request() req,
    @Param('termId', ParseUUIDPipe) termId: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can publish results');
    }
    if (!req.user.schoolId) {
      throw new UnauthorizedException('Missing school scope');
    }
    const result = await this.settingsService.publishTermResults(termId, req.user.schoolId);
    await this.systemLoggingService.logAction({
      action: 'TERM_RESULTS_PUBLISHED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: termId,
      entityType: 'Term',
      newValues: result as any,
    });
    return result;
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
      isCompleted: calendar.isCompleted,
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
  const created = await this.settingsService.createTermPeriod(dto, req.user.sub);
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
  @ApiOperation({ 
    summary: 'Get all terms for the admin\'s school and active/specified academic calendar',
    description: 'Returns terms filtered by the logged-in admin\'s school. If academicCalendarId is provided, returns terms for that specific calendar (must belong to admin\'s school). If not provided, returns terms for the active academic calendar of the admin\'s school.'
  })
  @ApiQuery({
    name: 'academicCalendarId',
    required: false,
    description: 'Optional academic calendar ID. If not provided, uses the active academic calendar for the admin\'s school.',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'List of terms retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          schoolId: { type: 'string' },
          periodId: { type: 'string' },
          periodName: { type: 'string' },
          academicCalendarId: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          isCurrent: { type: 'boolean' },
          isCompleted: { type: 'boolean' },
          termNumber: { type: 'number' },
          term: { type: 'string' }
        }
      }
    }
  })
  async getTermPeriods(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ): Promise<TermPeriodDto[]> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access term periods');
    }
    
    // Get admin's school ID
    const adminUser = await this.userRepository.findOne({
      where: { id: req.user.sub },
      select: ['schoolId'],
    });

    if (!adminUser?.schoolId) {
      throw new UnauthorizedException('Admin must be associated with a school');
    }

    return this.settingsService.getTermPeriods(academicCalendarId, adminUser.schoolId);
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
    const updated = await this.settingsService.activateTermPeriod(id, req.user.sub);
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
    const updated = await this.settingsService.updateTermPeriod(id, updateDto, req.user.sub);
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
  @ApiOperation({ summary: 'Get all terms in the active academic calendar' })
  @ApiResponse({
    status: 200,
    description: 'List of terms retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          academicCalendarId: { type: 'string' },
          periodId: { type: 'string' },
          periodName: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          isCurrent: { type: 'boolean' },
          isCompleted: { type: 'boolean' },
          termNumber: { type: 'number' },
          term: { type: 'string' }
        }
      }
    }
  })
  async listTerms(
    @Request() req,
    @Query('academicCalendarId') academicCalendarId?: string,
  ) {
    if (!['ADMIN','FINANCE','TEACHER'].includes(req.user.role)) {
      throw new UnauthorizedException('Only admins, finance or teacher can access terms');
    }
    return this.settingsService.getTerms(academicCalendarId, req.user.schoolId);
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

  @UseGuards(JwtAuthGuard)
  @Patch('periods/term/:id/complete')
  @ApiOperation({ summary: 'Complete a term and mark it as finished' })
  @ApiResponse({
    status: 200,
    description: 'Term completed successfully',
    schema: {
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: { 
          type: 'object',
          properties: {
            termCompleted: { type: 'boolean' },
            calendarCompleted: { type: 'boolean' },
            nextYearAdvanced: { type: 'boolean' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Admin access required' })
  @ApiResponse({ status: 404, description: 'Term not found or does not belong to school' })
  async completeTerm(
    @Request() req,
    @Param('id', ParseUUIDPipe) termId: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can complete terms');
    }

    if (!req.user.schoolId) {
      throw new UnauthorizedException('Administrator must be associated with a school');
    }

    try {
      const result = await this.settingsService.completeTerm(termId, req.user.schoolId);
      
      await this.systemLoggingService.logAction({
        action: 'TERM_COMPLETED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
        entityId: termId,
        entityType: 'Term',
        newValues: result as any
      });

      return {
        success: true,
        message: 'Term completed successfully',
        data: result
      };
    } catch (error) {
      this.logger.error(`Error completing term ${termId}: ${error.message}`, error.stack);
      if (error.message.includes('not found') || error.message.includes('does not belong')) {
        throw new NotFoundException(error.message);
      }
      throw new InternalServerErrorException(`Failed to complete term: ${error.message}`);
    }
  }

  // -------- Term Holiday Endpoints ---------
  @UseGuards(JwtAuthGuard)
  @Post('terms/:termId/holidays')
  async createTermHoliday(
    @Request() req,
    @Param('termId', ParseUUIDPipe) termId: string,
    @Body() dto: CreateTermHolidayDto,
  ) {
    if (req.user.role !== 'ADMIN') throw new UnauthorizedException('Only admins can create term holidays');
    if (!req.user.schoolId) throw new UnauthorizedException('Missing school');
    const created = await this.settingsService.createTermHoliday(termId, req.user.schoolId, dto, req.user.sub);
    await this.systemLoggingService.logAction({
      action: 'TERM_HOLIDAY_CREATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: created.id,
      entityType: 'TermHoliday',
      newValues: created as any,
    });
    return created;
  }

  @UseGuards(JwtAuthGuard)
  @Get('terms/:termId/holidays')
  async listTermHolidays(
    @Request() req,
    @Param('termId', ParseUUIDPipe) termId: string,
  ) {
    if (req.user.role !== 'ADMIN') throw new UnauthorizedException('Only admins can view term holidays');
    if (!req.user.schoolId) throw new UnauthorizedException('Missing school');
    return this.settingsService.listTermHolidays(termId, req.user.schoolId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('holidays/:id')
  async updateTermHoliday(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermHolidayDto,
  ) {
    if (req.user.role !== 'ADMIN') throw new UnauthorizedException('Only admins can update term holidays');
    if (!req.user.schoolId) throw new UnauthorizedException('Missing school');
    const updated = await this.settingsService.updateTermHoliday(id, req.user.schoolId, dto);
    await this.systemLoggingService.logAction({
      action: 'TERM_HOLIDAY_UPDATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: updated.id,
      entityType: 'TermHoliday',
      newValues: updated as any,
    });
    return updated;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('holidays/:id/activate')
  async activateTermHoliday(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (req.user.role !== 'ADMIN') throw new UnauthorizedException('Only admins can activate term holidays');
    if (!req.user.schoolId) throw new UnauthorizedException('Missing school');
    const activated = await this.settingsService.activateTermHoliday(id, req.user.schoolId);
    await this.systemLoggingService.logAction({
      action: 'TERM_HOLIDAY_ACTIVATED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: activated.id,
      entityType: 'TermHoliday',
      newValues: activated as any,
    });
    return activated;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('holidays/:id/complete')
  async completeTermHoliday(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (req.user.role !== 'ADMIN') throw new UnauthorizedException('Only admins can complete term holidays');
    if (!req.user.schoolId) throw new UnauthorizedException('Missing school');
    const completed = await this.settingsService.completeTermHoliday(id, req.user.schoolId);
    await this.systemLoggingService.logAction({
      action: 'TERM_HOLIDAY_COMPLETED',
      module: 'SETTINGS',
      level: 'info',
      performedBy: { id: req.user.sub, email: req.user.email, role: req.user.role },
      entityId: completed.id,
      entityType: 'TermHoliday',
      newValues: completed as any,
    });
    return completed;
  }

  // Student Promotion Endpoints

  // Academic Calendar Closure Endpoints

  @UseGuards(JwtAuthGuard)
  @Get('academic-calendar/:id/closure-preview')
  @ApiOperation({ summary: 'Preview academic calendar closure' })
  @ApiParam({ name: 'id', description: 'Academic calendar ID' })
  @ApiResponse({ status: 200, description: 'Academic calendar closure preview' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Academic calendar not found' })
  async previewAcademicCalendarClosure(
    @Request() req,
    @Param('id') academicCalendarId: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can preview academic calendar closure');
    }

    try {
      const preview = await this.settingsService.previewAcademicCalendarClosure(
        academicCalendarId,
        req.user.id,
      );

      return {
        success: true,
        message: 'Academic calendar closure preview generated successfully',
        data: preview,
      };
    } catch (error) {
      this.logger.error(`Error previewing academic calendar closure ${academicCalendarId}: ${error.message}`, error.stack);
      if (error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      if (error.message.includes('Cannot close') || error.message.includes('already closed')) {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException(`Failed to preview academic calendar closure: ${error.message}`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('close-academic-calendar/:id')
  @ApiOperation({ summary: 'Close academic calendar (complete current, activate next, promote students)' })
  @ApiParam({ name: 'id', description: 'Academic calendar ID' })
  @ApiResponse({ status: 200, description: 'Academic calendar closed successfully', type: AcademicCalendarClosureDto })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Academic calendar not found' })
  async closeAcademicCalendar(
    @Request() req,
    @Param('id', new ParseUUIDPipe()) academicCalendarId: string,
  ): Promise<AcademicCalendarClosureDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only school administrators can close academic calendars');
    }
    if (!req.user.schoolId) {
      throw new UnauthorizedException('Administrator must belong to a school');
    }
    try {
      const result = await this.settingsService.closeAcademicCalendar(academicCalendarId, req.user.sub || req.user.id);
      await this.systemLoggingService.logAction({
        action: 'ACADEMIC_CALENDAR_CLOSED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: { id: req.user.sub || req.user.id, email: req.user.email, role: req.user.role },
        entityId: academicCalendarId,
        entityType: 'AcademicCalendar',
        newValues: result as any,
      });
      return result;
    } catch (error) {
      this.logger.error(`Error closing academic calendar ${academicCalendarId}: ${error.message}`, error.stack);
      if (error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      if (error.message.includes('Cannot close') || error.message.includes('already closed')) {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException('Failed to close academic calendar');
    }
  }

  // POST /academic-calendar/:id/close (deprecated)
  // Previously used to close an academic calendar. Use PATCH /settings/close-academic-calendar/:id instead.
}
