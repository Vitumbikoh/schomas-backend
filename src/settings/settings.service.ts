import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository, LessThan } from 'typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { User } from '../user/entities/user.entity';
import { SchoolSettings } from './entities/school-settings.entity';
import { Role } from '../user/enums/role.enum';
import { Teacher } from '../user/entities/teacher.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { Finance } from '../user/entities/finance.entity';
import * as bcrypt from 'bcrypt';
import {
  AcademicCalendarDto,
  SchoolSettingsDto,
  SettingsResponseDto,
  PeriodDto,
  UpdateSettingsDto,
} from './dtos/settings.dto';
import { AcademicCalendarClosureDto } from './dtos/academic-calendar.dto';
import { AcademicCalendar } from './entities/academic-calendar.entity';
import { Period } from './entities/period.entity';
import { Term } from './entities/term.entity';
import { AcademicCalendarUtils } from './utils/academic-calendar.utils';
import {
  TermPeriodDto,
  CreateTermPeriodDto,
} from './dtos/term-period.dto';
import { AcademicCalendarConstraintService } from './services/academic-calendar-constraint.service';
import { StudentPromotionService } from '../student/services/student-promotion.service';
import { TermHoliday } from './entities/term-holiday.entity';
import { CreateTermHolidayDto, UpdateTermHolidayDto, TermHolidayDto } from './dtos/term-holiday.dto';
import { SystemLoggingService } from '../logs/system-logging.service';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
    @InjectRepository(SchoolSettings)
    private schoolSettingsRepository: Repository<SchoolSettings>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private parentRepository: Repository<Parent>,
    @InjectRepository(Finance)
    private financeRepository: Repository<Finance>,
    @InjectRepository(AcademicCalendar)
    private academicCalendarRepository: Repository<AcademicCalendar>,
    @InjectRepository(Period)
    private periodRepository: Repository<Period>,
  @InjectRepository(Term)
  private termRepository: Repository<Term>,
  @InjectRepository(TermHoliday)
  private termHolidayRepository: Repository<TermHoliday>,
    private dataSource: DataSource,
  private academicCalendarConstraintService: AcademicCalendarConstraintService,
  private studentPromotionService: StudentPromotionService,
  private systemLoggingService: SystemLoggingService,
    
  ) {}

  async onModuleInit() {
    await this.initializeDefaultPeriods();
  }

  // User Settings Methods
  async getSettings(userId: string): Promise<SettingsResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings', 'teacher', 'student', 'parent', 'finance'],
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Initialize default settings if they don't exist
      if (!user.settings) {
        const newSettings = this.userSettingsRepository.create({
          notifications: {
            email: true,
            sms: false,
            browser: true,
            weeklySummary: true,
          },
          security: {
            twoFactor: false,
          },
        });
        user.settings = await this.userSettingsRepository.save(newSettings);
        await this.userRepository.save(user);
      }

      const response: SettingsResponseDto = {
        user: {
          id: user.id,
          username: user.username,
          email: user.email ?? null,
          role: user.role,
          image: user.image,
          notifications: user.settings.notifications,
          security: user.settings.security,
        },
      };

      // Only get phone number for non-admin roles
      if (user.role !== Role.ADMIN) {
        if (user.role === Role.TEACHER && user.teacher) {
          response.user.phone = user.teacher.phoneNumber;
        } else if (user.role === Role.STUDENT && user.student) {
          response.user.phone = user.student.phoneNumber;
        } else if (user.role === Role.PARENT && user.parent) {
          response.user.phone = user.parent.phoneNumber;
        } else if (user.role === Role.FINANCE && user.finance) {
          response.user.phone = user.finance.phoneNumber;
        }
      }

      // Rest of your admin-specific settings...
      if (user.role === Role.ADMIN && user.schoolId) {
        // School settings - scoped by user's schoolId
        let schoolSettings = await this.schoolSettingsRepository.findOne({
          where: { schoolId: user.schoolId },
        });

        if (!schoolSettings) {
          // Create default settings for this school
          schoolSettings = await this.schoolSettingsRepository.save({
            schoolId: user.schoolId,
            schoolName: '',
            schoolEmail: '',
            schoolPhone: '',
            schoolAddress: '',
            schoolAbout: '',
          } as Partial<SchoolSettings>);
        }

        response.schoolSettings = {
          schoolName: schoolSettings.schoolName || '',
          schoolEmail: schoolSettings.schoolEmail || '',
          schoolPhone: schoolSettings.schoolPhone || '',
          schoolAddress: schoolSettings.schoolAddress || '',
          schoolAbout: schoolSettings.schoolAbout || '',
        };

        // Academic calendar - with proper date handling (scoped to admin's school)
        const academicCalendar = await this.academicCalendarRepository.findOne({
          where: { schoolId: user.schoolId, isActive: true },
        });

        // Update the academic calendar handling part
        if (academicCalendar) {
          response.academicCalendar = {
            id: academicCalendar.id,
            term: academicCalendar.term,
            startDate: academicCalendar.startDate
              ? new Date(academicCalendar.startDate).toISOString()
              : undefined,
            endDate: academicCalendar.endDate
              ? new Date(academicCalendar.endDate).toISOString()
              : undefined,
            isActive: academicCalendar.isActive,
          };

          // Current period
          const currentPeriod = await this.termRepository.findOne({
            where: {
              academicCalendar: { id: academicCalendar.id },
              isCurrent: true,
            },
            relations: ['period'],
          });

          if (currentPeriod) {
            response.currentPeriod = {
              id: currentPeriod.id,
              periodName: currentPeriod.period.name,
              startDate: currentPeriod.startDate.toISOString(),
              endDate: currentPeriod.endDate.toISOString(),
              isCurrent: currentPeriod.isCurrent,
              term: academicCalendar.term,
            };
          }
        }
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to get settings for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve user settings',
      );
    }
  }

  async updateSettings(
    userId: string,
    updateDto: UpdateSettingsDto,
    externalQueryRunner?: QueryRunner,
  ): Promise<SettingsResponseDto> {
    const shouldManageTransaction = !externalQueryRunner;
    const queryRunner =
      externalQueryRunner || this.dataSource.createQueryRunner();

    if (shouldManageTransaction) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
        relations: ['settings', 'teacher', 'student', 'parent', 'finance'],
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Update user details
      if (updateDto.username) user.username = updateDto.username;
      if (updateDto.email) user.email = updateDto.email;

      // Ensure settings object exists (relation is now nullable)
      if (!user.settings) {
        const newSettings = this.userSettingsRepository.create({
          notifications: {
            email: true,
            sms: false,
            browser: true,
            weeklySummary: true,
          },
          security: { twoFactor: false },
        });
        user.settings = await queryRunner.manager.save(UserSettings, newSettings);
      }

      // Update phone number
      if (updateDto.phone) {
        await this.updatePhoneNumber(user, updateDto.phone, queryRunner);
      }

      // Update password if provided
      if (updateDto.currentPassword && updateDto.newPassword) {
        const isPasswordValid = await bcrypt.compare(
          updateDto.currentPassword,
          user.password,
        );
        if (!isPasswordValid) {
          throw new UnauthorizedException('Current password is incorrect');
        }
        if (updateDto.currentPassword === updateDto.newPassword) {
          throw new BadRequestException(
            'New password must be different from current password',
          );
        }
        user.password = await bcrypt.hash(updateDto.newPassword, 10);
      }

      // Update settings
      if (updateDto.notifications) {
        user.settings!.notifications = {
          ...user.settings!.notifications,
          ...updateDto.notifications,
        } as any;
      }
      if (updateDto.security) {
        user.settings!.security = {
          ...user.settings!.security,
          ...updateDto.security,
        } as any;
      }
      if (user.settings) {
        await queryRunner.manager.save(UserSettings, user.settings);
      }
      await queryRunner.manager.save(User, user);

      // Update admin-specific settings
      if (user.role === Role.ADMIN && user.schoolId) {
        if (updateDto.schoolSettings) {
          await this.updateSchoolSettings(
            updateDto.schoolSettings,
            user.schoolId,
            queryRunner,
          );
        }
        if (updateDto.academicCalendar) {
          await this.updateAcademicCalendar(
            updateDto.academicCalendar,
            queryRunner,
          );
        }
        if (updateDto.currentPeriod) {
          await this.updateCurrentPeriod(updateDto.currentPeriod, queryRunner);
        }
      }

      if (shouldManageTransaction) {
        await queryRunner.commitTransaction();
      }

      return await this.getSettings(userId);
    } catch (error) {
      if (shouldManageTransaction) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(
        `Failed to update settings for user ${userId}`,
        error.stack,
      );
      throw error;
    } finally {
      if (shouldManageTransaction) {
        await queryRunner.release();
      }
    }
  }

  // Academic Calendar Methods
  async createAcademicCalendar(
    dto: AcademicCalendarDto,
    queryRunner: QueryRunner,
  ): Promise<AcademicCalendarDto> {
    // First deactivate all other calendars if this one should be active
    if (dto.isActive) {
      await queryRunner.manager.update(
        AcademicCalendar,
        { isActive: true },
        { isActive: false },
      );
    }

    const calendar = await queryRunner.manager.save(AcademicCalendar, {
      term: dto.term,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      isActive: dto.isActive ?? false,
    });

    // Create default periods for the new academic calendar
    const periods = await this.periodRepository.find();
    if (periods.length === 0) {
      await this.initializeDefaultPeriods();
    }

    for (const period of await this.periodRepository.find()) {
      await queryRunner.manager.save(Term, {
        academicCalendar: calendar,
        period,
        startDate: new Date(dto.startDate || new Date().toISOString()),
        endDate: new Date(dto.endDate || new Date().toISOString()),
        isCurrent: false,
      });
    }

    return {
      id: calendar.id,
      term: calendar.term,
      startDate: calendar.startDate?.toISOString(),
      endDate: calendar.endDate?.toISOString(),
      isActive: calendar.isActive,
      isCompleted: calendar.isCompleted,
    };
  }

  async getAllAcademicCalendars(): Promise<AcademicCalendarDto[]> {
    const calendars = await this.academicCalendarRepository.find({
      order: { createdAt: 'DESC' },
    });

    return calendars.map((calendar) => ({
      id: calendar.id,
      term: calendar.term,
      startDate: calendar.startDate?.toISOString(),
      endDate: calendar.endDate?.toISOString(),
      isActive: calendar.isActive,
      isCompleted: calendar.isCompleted,
    }));
  }

  async activateAcademicCalendar(id: string, schoolId: string): Promise<AcademicCalendarDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First check if the calendar belongs to the school
      const calendar = await queryRunner.manager.findOne(AcademicCalendar, {
        where: { id, schoolId },
      });

      if (!calendar) {
        throw new NotFoundException('Academic calendar not found for your school');
      }

      // Validate calendar activation constraints (3-year completion rule)
      const constraintValidation = await this.academicCalendarConstraintService.validateCalendarActivation(
        schoolId,
        id
      );

      if (!constraintValidation.canActivate) {
        throw new BadRequestException(constraintValidation.reason);
      }

      // Get the currently active calendar for validation
      const currentActiveCalendar = await queryRunner.manager.findOne(AcademicCalendar, {
        where: { schoolId, isActive: true },
      });

      // Validate that we're not setting a previous calendar as active (existing validation)
      const validation = AcademicCalendarUtils.canActivateCalendar(
        calendar.term,
        currentActiveCalendar?.term
      );

      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }

      // Check if we're moving to a new academic calendar (not just reactivating the same one)
      const isNewAcademicCalendar = currentActiveCalendar && 
        currentActiveCalendar.id !== calendar.id &&
        currentActiveCalendar.isCompleted; // Only allow if previous calendar is completed

      // Deactivate all other calendars for this school only
      await queryRunner.manager.update(
        AcademicCalendar,
        { schoolId, isActive: true },
        { isActive: false },
      );

      // Then activate the selected one
      calendar.isActive = true;
      const updatedCalendar = await queryRunner.manager.save(
        AcademicCalendar,
        calendar,
      );

      // If we're moving to a new academic calendar, promote all students to the next class
      if (isNewAcademicCalendar) {
        this.logger.log(
          `Moving from completed academic calendar "${currentActiveCalendar.term}" to new calendar "${calendar.term}". Promoting students for school ${schoolId}`
        );

        try {
          const promotionResult = await this.studentPromotionService.promoteStudentsToNextClass(
            schoolId,
            queryRunner
          );

          this.logger.log(
            `Student promotion completed for school ${schoolId}: ${promotionResult.promotedStudents} promoted, ${promotionResult.graduatedStudents} graduated, ${promotionResult.errors.length} errors`
          );

          // Log any promotion errors but don't fail the calendar activation
          if (promotionResult.errors.length > 0) {
            this.logger.warn(
              `Promotion errors for school ${schoolId}: ${promotionResult.errors.join(', ')}`
            );
          }
        } catch (promotionError) {
          // Log promotion error but don't fail the calendar activation
          this.logger.error(
            `Failed to promote students for school ${schoolId}:`,
            promotionError.stack
          );
        }
      } else if (currentActiveCalendar && currentActiveCalendar.id === calendar.id) {
        this.logger.log(
          `Reactivating the same academic calendar "${calendar.term}". No student promotion needed.`
        );
      }

      await queryRunner.commitTransaction();

      // Prepare the response data before releasing the query runner
      const result = {
        id: updatedCalendar.id,
        term: updatedCalendar.term,
        startDate: updatedCalendar.startDate ? new Date(updatedCalendar.startDate).toISOString() : undefined,
        endDate: updatedCalendar.endDate ? new Date(updatedCalendar.endDate).toISOString() : undefined,
        isActive: updatedCalendar.isActive,
      };

      await queryRunner.release();
      return result;
    } catch (error) {
      // Only rollback if transaction is still active
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error('Failed to activate academic calendar', error.stack);
      throw error;
    } finally {
      // Ensure query runner is released if not already done
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  // Period Methods
  async createPeriod(dto: PeriodDto): Promise<PeriodDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First find or create the period
      let period = await this.periodRepository.findOne({
        where: { name: dto.periodName },
      });

      if (!period) {
        period = await queryRunner.manager.save(Period, {
          name: dto.periodName,
          order: parseInt(dto.periodName.split(' ')[1]),
        });
      }

      // Find the academic calendar
      const academicCalendar = await this.academicCalendarRepository.findOne({
        where: { term: dto.term },
      });

      if (!academicCalendar) {
        throw new NotFoundException('Academic calendar not found');
      }

      // Create the term entry
      const newTerm = await queryRunner.manager.save(Term, {
        academicCalendar,
        period,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent,
      });

      // If activating this period, deactivate others
      if (dto.isCurrent) {
        await queryRunner.manager.update(
          Term,
          {
            academicCalendar: { id: academicCalendar.id },
            isCurrent: true,
          },
          { isCurrent: false },
        );
        await queryRunner.manager.update(
          Term,
          { id: newTerm.id },
          { isCurrent: true },
        );
      }

      await queryRunner.commitTransaction();

      return {
        id: newTerm.id,
        periodName: period.name,
        startDate: newTerm.startDate.toISOString(),
        endDate: newTerm.endDate.toISOString(),
        isCurrent: newTerm.isCurrent,
        term: academicCalendar.term,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create period', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Period Methods
  async getAvailablePeriods(): Promise<Period[]> {
    return this.periodRepository.find({ order: { order: 'ASC' } });
  }

  async getTermPeriods(
    academicCalendarId?: string,
    schoolId?: string,
  ): Promise<TermPeriodDto[]> {
    if (!schoolId) {
      throw new UnauthorizedException('School ID is required');
    }

    let targetAcademicCalendarId = academicCalendarId;

    this.logger.log(`Getting term periods for schoolId: ${schoolId}, academicCalendarId: ${academicCalendarId}`);

    // If no academicCalendarId is provided, get the active academic calendar for the school
    if (!academicCalendarId) {
      const activeAcademicCalendar = await this.academicCalendarRepository.findOne({
        where: { schoolId, isActive: true },
        select: ['id'],
      });

      if (!activeAcademicCalendar) {
        throw new NotFoundException('No active academic calendar found for your school');
      }

      targetAcademicCalendarId = activeAcademicCalendar.id;
      this.logger.log(`Using active academic calendar: ${targetAcademicCalendarId}`);
    } else {
      // If academicCalendarId is provided, verify it belongs to the admin's school
      const academicCalendar = await this.academicCalendarRepository.findOne({
        where: { id: academicCalendarId, schoolId },
        select: ['id'],
      });

      if (!academicCalendar) {
        throw new NotFoundException('Academic calendar not found for your school');
      }
      this.logger.log(`Using provided academic calendar: ${targetAcademicCalendarId}`);
    }

    const terms = await this.termRepository.find({
      where: {
        schoolId,
        academicCalendar: { id: targetAcademicCalendarId },
      },
      relations: ['academicCalendar', 'period'],
      order: { termNumber: 'ASC', startDate: 'ASC' },
    });

    this.logger.log(`Found ${terms.length} terms for schoolId: ${schoolId}, academicCalendarId: ${targetAcademicCalendarId}`);

    return terms.map((term) => ({
      id: term.id,
      schoolId: term.schoolId,
      periodId: term.period.id,
      periodName: term.period.name,
      academicCalendarId: term.academicCalendar.id,
      startDate: term.startDate.toISOString(),
      endDate: term.endDate.toISOString(),
      isCurrent: term.isCurrent,
      isCompleted: term.isCompleted,
      termNumber: term.termNumber,
      term: term.academicCalendar.term,
    }));
  }

  async activateTermPeriod(id: string, adminUserId: string): Promise<TermPeriodDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get the admin user to verify school access
      const adminUser = await this.userRepository.findOne({
        where: { id: adminUserId },
        select: ['id', 'schoolId'],
      });

      if (!adminUser?.schoolId) {
        throw new UnauthorizedException('Admin must be associated with a school');
      }

      const termToActivate = await queryRunner.manager.findOne(Term, {
        where: { id, schoolId: adminUser.schoolId },
        relations: ['academicCalendar', 'period'],
      });

      if (!termToActivate) {
        throw new NotFoundException('Term period not found for your school');
      }

      // Check if previous terms in this academic calendar are completed
      if (termToActivate.termNumber > 1) {
        const previousTerms = await queryRunner.manager.find(Term, {
          where: {
            academicCalendar: { id: termToActivate.academicCalendar.id },
            termNumber: LessThan(termToActivate.termNumber),
          },
        });

        const incompletePreviousTerms = previousTerms.filter(term => !term.isCompleted);
        
        if (incompletePreviousTerms.length > 0) {
          const incompleteTermNumbers = incompletePreviousTerms.map(t => t.termNumber).join(', ');
          throw new BadRequestException(
            `Cannot activate term ${termToActivate.termNumber}. Previous term(s) ${incompleteTermNumbers} must be completed first.`
          );
        }
      }

      // First deactivate all other periods in this academic calendar
      await queryRunner.manager.update(
        Term,
        {
          academicCalendar: { id: termToActivate.academicCalendar.id },
          isCurrent: true,
        },
        { isCurrent: false },
      );

      // Then activate this period
      termToActivate.isCurrent = true;
      const updatedTerm = await queryRunner.manager.save(
        Term,
        termToActivate,
      );
      await queryRunner.commitTransaction();

      return {
        id: updatedTerm.id,
        schoolId: updatedTerm.schoolId,
        periodId: termToActivate.period.id,
        periodName: termToActivate.period.name, // Now matches DTO
        academicCalendarId: termToActivate.academicCalendar.id,
        startDate: updatedTerm.startDate.toISOString(),
        endDate: updatedTerm.endDate.toISOString(),
        isCurrent: updatedTerm.isCurrent,
        isCompleted: updatedTerm.isCompleted,
        termNumber: updatedTerm.termNumber,
        term: termToActivate.academicCalendar.term,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to activate term period', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPeriods(academicCalendarId?: string): Promise<PeriodDto[]> {
    const where: any = {};
    if (academicCalendarId) {
      where.academicCalendar = { id: academicCalendarId };
    }

    const Terms = await this.termRepository.find({
      where,
      relations: ['academicCalendar', 'period'],
      order: { period: { order: 'ASC' } },
    });

    return Terms.map((ay) => ({
      id: ay.id,
      periodName: ay.period.name,
      startDate: ay.startDate.toISOString(),
      endDate: ay.endDate.toISOString(),
      isCurrent: ay.isCurrent,
      term: ay.academicCalendar.term,
    }));
  }

  async updatePeriod(id: string, dto: PeriodDto): Promise<PeriodDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const termToUpdate = await queryRunner.manager.findOne(Term, {
        where: { id },
        relations: ['academicCalendar', 'period'],
      });

      if (!termToUpdate) {
        throw new NotFoundException('Period not found');
      }

      termToUpdate.startDate = new Date(dto.startDate);
      termToUpdate.endDate = new Date(dto.endDate);
      termToUpdate.isCurrent = dto.isCurrent;

      // If activating this period, deactivate others
      if (dto.isCurrent) {
        await queryRunner.manager.update(
          Term,
          {
            academicCalendar: { id: termToUpdate.academicCalendar.id },
            isCurrent: true,
          },
          { isCurrent: false },
        );
      }

      const updatedTerm = await queryRunner.manager.save(
        Term,
        termToUpdate,
      );
      await queryRunner.commitTransaction();

      return {
        id: updatedTerm.id,
        periodName: termToUpdate.period.name,
        startDate: updatedTerm.startDate.toISOString(),
        endDate: updatedTerm.endDate.toISOString(),
        isCurrent: updatedTerm.isCurrent,
        term: termToUpdate.academicCalendar.term,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to update period', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Add this to your SettingsService class
  async createTermPeriod(
    dto: CreateTermPeriodDto,
    adminUserId: string,
  ): Promise<TermPeriodDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get the admin user to get their school ID
      const adminUser = await this.userRepository.findOne({
        where: { id: adminUserId },
        select: ['id', 'schoolId', 'role'],
      });

      if (!adminUser) {
        throw new NotFoundException('Admin user not found');
      }

      if (!adminUser.schoolId) {
        throw new BadRequestException('Admin user must be associated with a school');
      }

      // Get the active academic calendar for this school
      const activeCalendar = await this.academicCalendarRepository.findOne({
        where: { isActive: true },
      });

      if (!activeCalendar) {
        throw new BadRequestException('No active academic calendar found');
      }

      // Get the period
      const period = await this.periodRepository.findOne({
        where: { id: dto.periodId },
      });

      if (!period) {
        throw new NotFoundException('Period not found');
      }

      // Check if this period already exists for the academic calendar and school
      const existingPeriod = await this.termRepository.findOne({
        where: {
          academicCalendar: { id: activeCalendar.id },
          period: { id: dto.periodId },
          schoolId: adminUser.schoolId,
        },
      });

      if (existingPeriod) {
        throw new BadRequestException(
          'This period already exists for the term in this school',
        );
      }

      // Create the term period
      const TermPeriod = this.termRepository.create({
        schoolId: adminUser.schoolId,
        academicCalendar: activeCalendar,
        period,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent,
        termNumber: dto.termNumber ?? period.order, // Use provided termNumber or default to period order
      });

      // If this period is being set as current, deactivate others
      if (dto.isCurrent) {
        await queryRunner.manager.update(
          Term,
          {
            academicCalendar: { id: activeCalendar.id },
            isCurrent: true,
          },
          { isCurrent: false },
        );
      }

      const savedPeriod = await queryRunner.manager.save(TermPeriod);
      await queryRunner.commitTransaction();

      return {
        id: savedPeriod.id,
        schoolId: savedPeriod.schoolId,
        periodId: savedPeriod.period.id,
        periodName: savedPeriod.period.name, // Now matches DTO
        academicCalendarId: savedPeriod.academicCalendar.id,
        startDate: savedPeriod.startDate.toISOString(),
        endDate: savedPeriod.endDate.toISOString(),
        isCurrent: savedPeriod.isCurrent,
        isCompleted: savedPeriod.isCompleted,
        termNumber: savedPeriod.termNumber,
        term: savedPeriod.academicCalendar.term,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create term period', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateTermPeriod(
    id: string,
    dto: CreateTermPeriodDto,
    adminUserId: string,
  ): Promise<TermPeriodDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get the admin user to verify school access
      const adminUser = await this.userRepository.findOne({
        where: { id: adminUserId },
        select: ['id', 'schoolId'],
      });

      if (!adminUser?.schoolId) {
        throw new UnauthorizedException('Admin must be associated with a school');
      }

      // Find the term period to update
      const termToUpdate = await queryRunner.manager.findOne(Term, {
        where: { id, schoolId: adminUser.schoolId },
        relations: ['academicCalendar', 'period'],
      });

      if (!termToUpdate) {
        throw new NotFoundException('Term period not found for your school');
      }

      // Update the term period
      termToUpdate.startDate = new Date(dto.startDate);
      termToUpdate.endDate = new Date(dto.endDate);
      termToUpdate.isCurrent = dto.isCurrent;
      if (dto.termNumber !== undefined) {
        termToUpdate.termNumber = dto.termNumber;
      }

      // If this period is being set as current, deactivate others
      if (dto.isCurrent) {
        await queryRunner.manager.update(
          Term,
          {
            academicCalendar: { id: termToUpdate.academicCalendar.id },
            isCurrent: true,
          },
          { isCurrent: false },
        );
      }

      const updatedPeriod = await queryRunner.manager.save(termToUpdate);
      await queryRunner.commitTransaction();

      return {
        id: updatedPeriod.id,
        schoolId: updatedPeriod.schoolId,
        periodId: termToUpdate.period.id,
        periodName: termToUpdate.period.name,
        academicCalendarId: termToUpdate.academicCalendar.id,
        startDate: updatedPeriod.startDate.toISOString(),
        endDate: updatedPeriod.endDate.toISOString(),
        isCurrent: updatedPeriod.isCurrent,
        isCompleted: updatedPeriod.isCompleted,
        termNumber: updatedPeriod.termNumber,
        term: termToUpdate.academicCalendar.term,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to update term period', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async activatePeriod(id: string): Promise<PeriodDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const termToActivate = await queryRunner.manager.findOne(Term, {
        where: { id },
        relations: ['academicCalendar', 'period'],
      });

      if (!termToActivate) {
        throw new NotFoundException('Period not found');
      }

      // First deactivate all other periods in this academic calendar
      await queryRunner.manager.update(
        Term,
        {
          academicCalendar: { id: termToActivate.academicCalendar.id },
          isCurrent: true,
        },
        { isCurrent: false },
      );

      // Then activate this period
      termToActivate.isCurrent = true;
      const updatedTerm = await queryRunner.manager.save(
        Term,
        termToActivate,
      );
      await queryRunner.commitTransaction();

      return {
        id: updatedTerm.id,
        periodName: termToActivate.period.name,
        startDate: updatedTerm.startDate.toISOString(),
        endDate: updatedTerm.endDate.toISOString(),
        isCurrent: updatedTerm.isCurrent,
        term: termToActivate.academicCalendar.term,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to activate period', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Helper Methods
  private async initializeDefaultPeriods() {
    try {
      const periodsCount = await this.periodRepository.count();
      if (periodsCount === 0) {
        const periodsToCreate = [
          { name: 'Period 1', order: 1 },
          { name: 'Period 2', order: 2 },
          { name: 'Period 3', order: 3 },
        ];
        await this.periodRepository.save(periodsToCreate);
        this.logger.log('Default periods initialized successfully');
      }
    } catch (error) {
      this.logger.error('Failed to initialize default periods', error.stack);
      throw new InternalServerErrorException(
        'Failed to initialize default periods',
      );
    }
  }

  private async updatePhoneNumber(
    user: User,
    phone: string,
    queryRunner: QueryRunner,
  ) {
    switch (user.role) {
      case Role.TEACHER:
        if (!user.teacher) {
          const newTeacher = this.teacherRepository.create({
            phoneNumber: phone,
          });
          newTeacher.user = user;
          user.teacher = await queryRunner.manager.save(Teacher, newTeacher);
        } else {
          user.teacher.phoneNumber = phone;
          await queryRunner.manager.save(Teacher, user.teacher);
        }
        break;
      case Role.STUDENT:
        if (!user.student) {
          const newStudent = this.studentRepository.create({
            phoneNumber: phone,
          });
          newStudent.user = user;
          user.student = await queryRunner.manager.save(Student, newStudent);
        } else {
          user.student.phoneNumber = phone;
          await queryRunner.manager.save(Student, user.student);
        }
        break;
      case Role.PARENT:
        if (!user.parent) {
          const newParent = this.parentRepository.create({
            phoneNumber: phone,
          });
          newParent.user = user;
          user.parent = await queryRunner.manager.save(Parent, newParent);
        } else {
          user.parent.phoneNumber = phone;
          await queryRunner.manager.save(Parent, user.parent);
        }
        break;
      case Role.FINANCE:
        if (!user.finance) {
          const newFinance = this.financeRepository.create({
            phoneNumber: phone,
          });
          newFinance.user = user;
          user.finance = await queryRunner.manager.save(Finance, newFinance);
        } else {
          user.finance.phoneNumber = phone;
          await queryRunner.manager.save(Finance, user.finance);
        }
        break;
      case Role.ADMIN:
        user.phone = phone;
        break;
      default:
        throw new BadRequestException(`Invalid role: ${user.role}`);
    }
  }

  private async updateSchoolSettings(
    schoolSettings: SchoolSettingsDto,
    schoolId: string,
    queryRunner: QueryRunner,
  ) {
    const existingSettings = await queryRunner.manager.findOne(SchoolSettings, {
      where: { schoolId },
    });

    if (!existingSettings) {
      await queryRunner.manager.save(SchoolSettings, {
        schoolId,
        ...schoolSettings,
      } as Partial<SchoolSettings>);
    } else {
      await queryRunner.manager.save(SchoolSettings, {
        ...existingSettings,
        ...schoolSettings,
      });
    }
  }

  private async updateAcademicCalendar(
    academicCalendar: AcademicCalendarDto,
    queryRunner: QueryRunner,
  ): Promise<AcademicCalendar> {
    const existing = await queryRunner.manager.findOne(AcademicCalendar, {
      where: { term: academicCalendar.term },
    });

    const calendarData: Partial<AcademicCalendar> = {
      term: academicCalendar.term,
      startDate: academicCalendar.startDate
        ? new Date(academicCalendar.startDate)
        : undefined,
      endDate: academicCalendar.endDate
        ? new Date(academicCalendar.endDate)
        : undefined,
      isActive: academicCalendar.isActive,
    };

    if (existing) {
      return queryRunner.manager.save(AcademicCalendar, {
        ...existing,
        ...calendarData,
      });
    }
    return queryRunner.manager.save(AcademicCalendar, calendarData);
  }

  private async updateCurrentPeriod(
    currentPeriod: PeriodDto,
    queryRunner: QueryRunner,
  ) {
    const termToUpdate = await this.termRepository.findOne({
      where: { id: currentPeriod.id },
      relations: ['academicCalendar'],
    });

    if (!termToUpdate) {
      throw new NotFoundException('Period not found');
    }

    // Reset current flag on all periods if activating a new period
    if (currentPeriod.isCurrent) {
      await queryRunner.manager.update(
        Term,
        {
          academicCalendar: { id: termToUpdate.academicCalendar.id },
          isCurrent: true,
        },
        { isCurrent: false },
      );
    }

    termToUpdate.startDate = new Date(currentPeriod.startDate);
    termToUpdate.endDate = new Date(currentPeriod.endDate);
    termToUpdate.isCurrent = currentPeriod.isCurrent;

    await queryRunner.manager.save(Term, termToUpdate);
  }
async getCurrentTerm(): Promise<{ id: string } | null> {
    try {
        const term = await this.termRepository.findOne({
            where: { isCurrent: true },
            select: ['id'],
        });
        return term ? { id: term.id } : null;
    } catch (error) {
        this.logger.error('Failed to get current term', error.stack);
        throw new InternalServerErrorException('Failed to get term');
    }
}

  async getTerms(academicCalendarId?: string, schoolId?: string) {
    // If no calendar id provided, try active calendar for the school
    let calendarId = academicCalendarId;
    if (!calendarId) {
      const whereActive: any = { isActive: true };
      if (schoolId) {
        whereActive.schoolId = schoolId;
      }
      const active = await this.academicCalendarRepository.findOne({ 
        where: whereActive, 
        select: ['id'] 
      });
      calendarId = active?.id;
    }
    
    if (!calendarId) {
      return [];
    }
    
    const terms = await this.termRepository.find({ 
      where: { academicCalendar: { id: calendarId } }, 
      relations: ['period', 'academicCalendar'], 
      order: { termNumber: 'ASC', startDate: 'ASC' } 
    });
    
    return terms.map(term => ({
      id: term.id,
      academicCalendarId: term.academicCalendar?.id,
      periodId: term.period?.id,
      periodName: term.period?.name,
      startDate: term.startDate?.toISOString(),
      endDate: term.endDate?.toISOString(),
      isCurrent: term.isCurrent,
      isCompleted: term.isCompleted,
      termNumber: term.termNumber,
      term: term.academicCalendar?.term || ''
    }));
  }

  /**
   * Enter exam period for the current term (or specified term)
   */
  async enterExamPeriod(termId: string, schoolId: string) {
    const term = await this.termRepository.findOne({ where: { id: termId, schoolId }, relations: ['academicCalendar'] });
    if (!term) throw new NotFoundException('Term not found');
    if (!term.isCurrent) throw new BadRequestException('Only the current term can enter exam period');
    if (term.inExamPeriod) return { success: true, message: 'Term already in exam period' };
    if (term.isCompleted) throw new BadRequestException('Cannot start exam period on a completed term');

    term.inExamPeriod = true;
    term.examPeriodStartedAt = new Date();
    await this.termRepository.save(term);
    return { success: true, message: 'Exam period started', termId: term.id, startedAt: term.examPeriodStartedAt };
  }

  /**
   * Publish results for a term after validation (placeholder validation)
   */
  async publishTermResults(termId: string, schoolId: string) {
    const term = await this.termRepository.findOne({ where: { id: termId, schoolId }, relations: ['academicCalendar'] });
    if (!term) throw new NotFoundException('Term not found');
    if (!term.inExamPeriod) throw new BadRequestException('Term has not entered exam period');
    if (term.resultsPublished) return { success: true, message: 'Results already published' };
    if (term.isCompleted) throw new BadRequestException('Cannot publish results for a completed term');

    // TODO: Add real validation: ensure all exams are graded
    term.resultsPublished = true;
    term.resultsPublishedAt = new Date();
    await this.termRepository.save(term);
    return { success: true, message: 'Results published', termId: term.id, publishedAt: term.resultsPublishedAt };
  }

  /**
   * Complete an term and advance to next year or complete calendar
   */
  async completeTerm(TermId: string, schoolId: string): Promise<{
    success: boolean;
    message: string;
    calendarCompleted?: boolean;
    nextYearActivated?: boolean;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate that the term belongs to the school
      const termToComplete = await queryRunner.manager.findOne(Term, {
        where: { id: TermId },
        relations: ['academicCalendar'],
      });

      if (!termToComplete || termToComplete.academicCalendar.schoolId !== schoolId) {
        throw new NotFoundException('Term not found for your school');
      }

      // Complete the term using constraint service
      const completionResult = await this.academicCalendarConstraintService.completeTerm(
        TermId,
        queryRunner
      );

      // If calendar is not fully completed, try to advance to next year
      let nextYearActivated = false;
      if (!completionResult.calendarCompleted) {
        try {
          const advanceResult = await this.academicCalendarConstraintService.advanceToNextYear(
            termToComplete.academicCalendar.id,
            queryRunner
          );
          nextYearActivated = advanceResult.success;
        } catch (error) {
          this.logger.warn(`Could not advance to next year: ${error.message}`);
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: completionResult.message,
        calendarCompleted: completionResult.calendarCompleted,
        nextYearActivated,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to complete term', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get calendar completion status for a school
   */
  async getCalendarCompletionStatus(schoolId: string) {
    return this.academicCalendarConstraintService.getSchoolCalendarsWithStatus(schoolId);
  }

  /**
   * Check if current calendar can be changed to a new one
   */
  async canActivateNewCalendar(schoolId: string, newCalendarId: string) {
    return this.academicCalendarConstraintService.validateCalendarActivation(schoolId, newCalendarId);
  }

  // ---------------- Term Holidays -----------------
  async createTermHoliday(termId: string, schoolId: string, dto: CreateTermHolidayDto, adminId: string): Promise<TermHolidayDto> {
    const term = await this.termRepository.findOne({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found for your school');

    if (dto.isCurrent) {
      // Deactivate existing current holiday(s) for school
      await this.termHolidayRepository.update({ schoolId, isCurrent: true }, { isCurrent: false });
    }
    const entity = this.termHolidayRepository.create({
      termId,
      schoolId,
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      isCurrent: dto.isCurrent ?? false,
    });
    const saved = await this.termHolidayRepository.save(entity);
    return this.toHolidayDto(saved);
  }

  async listTermHolidays(termId: string, schoolId: string): Promise<TermHolidayDto[]> {
    const holidays = await this.termHolidayRepository.find({ where: { termId, schoolId }, order: { startDate: 'ASC' } });
    return holidays.map(h => this.toHolidayDto(h));
  }

  async updateTermHoliday(id: string, schoolId: string, dto: UpdateTermHolidayDto): Promise<TermHolidayDto> {
    const holiday = await this.termHolidayRepository.findOne({ where: { id, schoolId } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    if (dto.isCurrent) {
      await this.termHolidayRepository.update({ schoolId, isCurrent: true }, { isCurrent: false });
    }
    if (dto.name !== undefined) holiday.name = dto.name;
    if (dto.startDate !== undefined) holiday.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) holiday.endDate = new Date(dto.endDate);
    if (dto.isCurrent !== undefined) holiday.isCurrent = dto.isCurrent;
    if (dto.isCompleted !== undefined) holiday.isCompleted = dto.isCompleted;
    const saved = await this.termHolidayRepository.save(holiday);
    return this.toHolidayDto(saved);
  }

  async activateTermHoliday(id: string, schoolId: string): Promise<TermHolidayDto> {
    const holiday = await this.termHolidayRepository.findOne({ where: { id, schoolId } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    await this.termHolidayRepository.update({ schoolId, isCurrent: true }, { isCurrent: false });
    holiday.isCurrent = true;
    const saved = await this.termHolidayRepository.save(holiday);
    return this.toHolidayDto(saved);
  }

  async completeTermHoliday(id: string, schoolId: string): Promise<TermHolidayDto> {
    const holiday = await this.termHolidayRepository.findOne({ where: { id, schoolId } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    holiday.isCompleted = true;
    holiday.isCurrent = false;
    const saved = await this.termHolidayRepository.save(holiday);
    return this.toHolidayDto(saved);
  }

  private toHolidayDto(h: TermHoliday): TermHolidayDto {
    const toIso = (value: any): string => {
      if (!value) return '';
      // Already Date instance
      if (value instanceof Date) return value.toISOString();
      // If it's a string (likely from DATE column), parse safely
      if (typeof value === 'string') {
        // If it already looks like YYYY-MM-DD (no time), keep as is to avoid TZ shift
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + 'T00:00:00Z').toISOString();
        // Try Date parse
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toISOString();
        return value; // fallback raw
      }
      // Attempt construct
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {}
      return '';
    };

    return {
      id: h.id,
      termId: h.termId,
      schoolId: h.schoolId,
      name: h.name,
      startDate: toIso(h.startDate),
      endDate: toIso(h.endDate),
      isCurrent: !!h.isCurrent,
      isCompleted: !!h.isCompleted,
      createdAt: toIso(h.createdAt),
      updatedAt: toIso(h.updatedAt),
    };
  }

  /**
   * Check if all terms in an academic calendar are completed
   */
  async areAllTermsCompleted(academicCalendarId: string, schoolId: string): Promise<{
    allCompleted: boolean;
    completedTerms: number;
    totalTerms: number;
    incompleteTerms: string[];
  }> {
    const terms = await this.termRepository.find({
      where: {
        academicCalendar: { id: academicCalendarId },
        schoolId,
      },
      relations: ['period'],
    });

    const totalTerms = terms.length;
    const completedTerms = terms.filter(term => term.isCompleted);
    const incompleteTerms = terms
      .filter(term => !term.isCompleted)
      .map(term => `${term.period?.name || 'Unknown Period'} - Term ${term.termNumber}`);

    return {
      allCompleted: completedTerms.length === totalTerms && totalTerms > 0,
      completedTerms: completedTerms.length,
      totalTerms,
      incompleteTerms,
    };
  }

  /**
   * Get the next academic calendar for a school (chronologically)
   */
  async getNextAcademicCalendar(schoolId: string, currentCalendarId: string): Promise<AcademicCalendar | null> {
    const currentCalendar = await this.academicCalendarRepository.findOne({
      where: { id: currentCalendarId, schoolId },
    });

    if (!currentCalendar) {
      throw new Error('Current academic calendar not found');
    }

    // Extract year from current term (e.g., "2024-2025" -> 2025)
    const currentEndYear = parseInt(currentCalendar.term.split('-')[1]);

    // Find calendars for this school with higher end years
    const nextCalendars = await this.academicCalendarRepository.find({
      where: { schoolId },
      order: { term: 'ASC' },
    });

    // Find the next calendar chronologically
    for (const calendar of nextCalendars) {
      const calendarEndYear = parseInt(calendar.term.split('-')[1]);
      if (calendarEndYear > currentEndYear) {
        return calendar;
      }
    }

    return null;
  }

  /**
   * Close an academic calendar and promote students to the next academic year
   */
  async closeAcademicCalendar(
    academicCalendarId: string,
    adminUserId: string,
  ): Promise<AcademicCalendarClosureDto> {
    const admin = await this.userRepository.findOne({
      where: { id: adminUserId },
      select: ['id', 'email', 'role', 'schoolId'],
    });

    if (!admin?.schoolId) {
      throw new BadRequestException('Admin school information not found');
    }

    const schoolId = admin.schoolId;

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get the academic calendar to close
      const calendarToClose = await queryRunner.manager.findOne(AcademicCalendar, {
        where: { id: academicCalendarId, schoolId },
      });

      if (!calendarToClose) {
        throw new BadRequestException('Academic calendar not found');
      }

      if (!calendarToClose.isActive) {
        throw new BadRequestException('Cannot close an inactive academic calendar');
      }

      if (calendarToClose.isCompleted) {
        throw new BadRequestException('Academic calendar is already closed');
      }

      // Check if all terms are completed
      const termStatus = await this.areAllTermsCompleted(academicCalendarId, schoolId);
      if (!termStatus.allCompleted) {
        throw new BadRequestException(
          `Cannot close academic calendar. ${termStatus.incompleteTerms.length} term(s) are not completed: ${termStatus.incompleteTerms.join(', ')}`
        );
      }

      // Check if there's a next academic calendar available
      const nextCalendar = await this.getNextAcademicCalendar(schoolId, academicCalendarId);
      if (!nextCalendar) {
        throw new BadRequestException(
          'Cannot close academic calendar. No next academic calendar exists. Please create the next academic year before closing the current one.'
        );
      }

      // Mark current calendar as completed and inactive
      await queryRunner.manager.update(
        AcademicCalendar,
        { id: academicCalendarId },
        {
          isCompleted: true,
          isActive: false,
          updatedAt: new Date(),
        }
      );

      // Activate the next academic calendar
      await queryRunner.manager.update(
        AcademicCalendar,
        { schoolId, isActive: true },
        { isActive: false }
      );

      await queryRunner.manager.update(
        AcademicCalendar,
        { id: nextCalendar.id },
        {
          isActive: true,
          updatedAt: new Date(),
        }
      );

      // Perform student promotion
      let promotionResult = {
        promotedStudents: 0,
        graduatedStudents: 0,
        errors: [] as string[],
      };

      try {
        this.logger.log(`Starting student promotion for academic calendar closure. School: ${schoolId}`);
        promotionResult = await this.studentPromotionService.promoteStudentsToNextClass(
          schoolId,
          queryRunner,
        );
        this.logger.log(
          `Student promotion completed for calendar closure. Promoted: ${promotionResult.promotedStudents}, Graduated: ${promotionResult.graduatedStudents}, Errors: ${promotionResult.errors.length}`
        );
      } catch (promotionError) {
        this.logger.error(`Student promotion failed during calendar closure:`, promotionError.stack);
        // Don't fail the entire operation if promotion fails
        promotionResult.errors.push(`Promotion failed: ${promotionError.message}`);
      }

      // Commit the transaction
      await queryRunner.commitTransaction();

      // Log the academic calendar closure
      await this.systemLoggingService.logAction({
        action: 'ACADEMIC_CALENDAR_CLOSED',
        module: 'SETTINGS',
        level: 'info',
        performedBy: {
          id: adminUserId,
          email: admin.email,
          role: admin.role,
        },
        schoolId,
        entityId: academicCalendarId,
        entityType: 'AcademicCalendar',
        metadata: {
          closedCalendarId: academicCalendarId,
          closedCalendarTerm: calendarToClose.term,
          newActiveCalendarId: nextCalendar.id,
          newActiveCalendarTerm: nextCalendar.term,
          promotionResult,
        },
      });

      const result: AcademicCalendarClosureDto = {
        closedCalendarId: academicCalendarId,
        closedCalendarTerm: calendarToClose.term,
        newActiveCalendarId: nextCalendar.id,
        newActiveCalendarTerm: nextCalendar.term,
        studentsPromoted: promotionResult.promotedStudents,
        studentsGraduated: promotionResult.graduatedStudents,
        promotionErrors: promotionResult.errors,
        completedTerms: termStatus.completedTerms,
        totalTerms: termStatus.totalTerms,
        message: `Academic calendar ${calendarToClose.term} has been successfully closed. ${nextCalendar.term} is now active. ${promotionResult.promotedStudents} students promoted, ${promotionResult.graduatedStudents} students graduated.`,
      };

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to close academic calendar ${academicCalendarId}:`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Preview academic calendar closure (dry run)
   */
  async previewAcademicCalendarClosure(
    academicCalendarId: string,
    adminUserId: string,
  ): Promise<{
    canClose: boolean;
    reasons: string[];
    termStatus: {
      allCompleted: boolean;
      completedTerms: number;
      totalTerms: number;
      incompleteTerms: string[];
    };
    nextCalendar: {
      id: string;
      term: string;
    } | null;
    promotionPreview: {
      promotions: Array<{
        studentId: string;
        studentName: string;
        currentClass: string;
        nextClass: string | null;
        status: 'promote' | 'graduate' | 'error';
      }>;
      summary: {
        totalStudents: number;
        toPromote: number;
        toGraduate: number;
        errors: number;
      };
    } | null;
  }> {
    const admin = await this.userRepository.findOne({
      where: { id: adminUserId },
      select: ['id', 'schoolId'],
    });

    if (!admin?.schoolId) {
      throw new BadRequestException('Admin school information not found');
    }

    const schoolId = admin.schoolId;
    const reasons: string[] = [];
    let canClose = true;

    // Get the academic calendar
    const calendar = await this.academicCalendarRepository.findOne({
      where: { id: academicCalendarId, schoolId },
    });

    if (!calendar) {
      reasons.push('Academic calendar not found');
      canClose = false;
    }

    if (calendar && !calendar.isActive) {
      reasons.push('Cannot close an inactive academic calendar');
      canClose = false;
    }

    if (calendar && calendar.isCompleted) {
      reasons.push('Academic calendar is already closed');
      canClose = false;
    }

    // Check term completion status
    const termStatus = await this.areAllTermsCompleted(academicCalendarId, schoolId);
    if (!termStatus.allCompleted) {
      reasons.push(`${termStatus.incompleteTerms.length} term(s) are not completed: ${termStatus.incompleteTerms.join(', ')}`);
      canClose = false;
    }

    // Check for next calendar
    let nextCalendar: { id: string; term: string } | null = null;
    try {
      const nextCal = await this.getNextAcademicCalendar(schoolId, academicCalendarId);
      if (nextCal) {
        nextCalendar = { id: nextCal.id, term: nextCal.term };
      } else {
        reasons.push('No next academic calendar exists. Please create the next academic year before closing the current one.');
        canClose = false;
      }
    } catch (error) {
      reasons.push('Error checking next academic calendar');
      canClose = false;
    }

    // Get promotion preview if possible
    let promotionPreview: {
      promotions: Array<{
        studentId: string;
        studentName: string;
        currentClass: string;
        nextClass: string | null;
        status: 'promote' | 'graduate' | 'error';
      }>;
      summary: {
        totalStudents: number;
        toPromote: number;
        toGraduate: number;
        errors: number;
      };
    } | null = null;
    if (canClose) {
      try {
        promotionPreview = await this.studentPromotionService.previewPromotion(schoolId);
      } catch (error) {
        this.logger.error('Failed to generate promotion preview:', error.stack);
        reasons.push('Unable to preview student promotions');
      }
    }

    return {
      canClose,
      reasons,
      termStatus,
      nextCalendar,
      promotionPreview,
    };
  }
}
