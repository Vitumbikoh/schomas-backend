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
import { DataSource } from 'typeorm';

@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
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
    // Get the connection from the injected DataSource
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (req.user.role !== 'ADMIN') {
        throw new UnauthorizedException(
          'Only admins can create academic calendars',
        );
      }

      const result = await this.settingsService.updateSettings(
        req.user.sub,
        { academicCalendar: dto },
        queryRunner,
      );

      if (!result.academicCalendar) {
        throw new NotFoundException(
          'Academic calendar not found after creation',
        );
      }

      await queryRunner.commitTransaction();
      return result.academicCalendar;
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
    const settings = await this.settingsService.getSettings(req.user.sub);
    if (!settings.academicCalendar) {
      throw new NotFoundException('Academic calendar not found');
    }
    return settings.academicCalendar;
  }

  // Term Endpoints
  @UseGuards(JwtAuthGuard)
  @Post('terms')
  async createTerm(@Request() req, @Body() dto: TermDto): Promise<TermDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can create terms');
    }
    await this.settingsService.updateSettings(req.user.sub, {
      currentTerm: dto,
    });
    const settings = await this.settingsService.getSettings(req.user.sub);
    if (!settings.currentTerm) {
      throw new NotFoundException('Term not found after creation');
    }
    return settings.currentTerm;
  }

  @UseGuards(JwtAuthGuard)
  @Get('terms')
  async getTerms(
    @Request() req,
    @Query('academicYear') academicYear?: string,
  ): Promise<TermDto> {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only admins can access terms');
    }
    const settings = await this.settingsService.getSettings(req.user.sub);
    if (!settings.currentTerm) {
      throw new NotFoundException('No current term found');
    }
    return settings.currentTerm;
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
    await this.settingsService.updateSettings(req.user.sub, {
      currentTerm: dto,
    });
    const settings = await this.settingsService.getSettings(req.user.sub);
    if (!settings.currentTerm) {
      throw new NotFoundException('Term not found after update');
    }
    return settings.currentTerm;
  }
}
