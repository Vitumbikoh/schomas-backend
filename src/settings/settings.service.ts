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
import { DataSource, QueryRunner, Repository } from 'typeorm';
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
  TermDto,
  UpdateSettingsDto,
} from './dtos/settings.dto';
import { AcademicCalendar } from './entities/academic-calendar.entity';
import { Term } from './entities/term.entity';
import { AcademicYear } from './entities/academic-year.entity';
import { AcademicCalendarUtils } from './utils/academic-calendar.utils';
import {
  AcademicYearTermDto,
  CreateAcademicYearTermDto,
} from './dtos/academic-year-term.dto';

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
    @InjectRepository(Term)
    private termRepository: Repository<Term>,
    @InjectRepository(AcademicYear)
    private academicYearRepository: Repository<AcademicYear>,
    private dataSource: DataSource,
    
  ) {}

  async onModuleInit() {
    await this.initializeDefaultTerms();
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
          email: user.email,
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
            academicYear: academicCalendar.academicYear,
            startDate: academicCalendar.startDate
              ? new Date(academicCalendar.startDate).toISOString()
              : undefined,
            endDate: academicCalendar.endDate
              ? new Date(academicCalendar.endDate).toISOString()
              : undefined,
            isActive: academicCalendar.isActive,
          };

          // Current term
          const currentTerm = await this.academicYearRepository.findOne({
            where: {
              academicCalendar: { id: academicCalendar.id },
              isCurrent: true,
            },
            relations: ['term'],
          });

          if (currentTerm) {
            response.currentTerm = {
              id: currentTerm.id,
              termName: currentTerm.term.name,
              startDate: currentTerm.startDate.toISOString(),
              endDate: currentTerm.endDate.toISOString(),
              isCurrent: currentTerm.isCurrent,
              academicYear: academicCalendar.academicYear,
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
        if (updateDto.currentTerm) {
          await this.updateCurrentTerm(updateDto.currentTerm, queryRunner);
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
      academicYear: dto.academicYear,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      isActive: dto.isActive ?? false,
    });

    // Create default terms for the new academic calendar
    const terms = await this.termRepository.find();
    if (terms.length === 0) {
      await this.initializeDefaultTerms();
    }

    for (const term of await this.termRepository.find()) {
      await queryRunner.manager.save(AcademicYear, {
        academicCalendar: calendar,
        term,
        startDate: new Date(dto.startDate || new Date().toISOString()),
        endDate: new Date(dto.endDate || new Date().toISOString()),
        isCurrent: false,
      });
    }

    return {
      id: calendar.id,
      academicYear: calendar.academicYear,
      startDate: calendar.startDate?.toISOString(),
      endDate: calendar.endDate?.toISOString(),
      isActive: calendar.isActive,
    };
  }

  async getAllAcademicCalendars(): Promise<AcademicCalendarDto[]> {
    const calendars = await this.academicCalendarRepository.find({
      order: { createdAt: 'DESC' },
    });

    return calendars.map((calendar) => ({
      id: calendar.id,
      academicYear: calendar.academicYear,
      startDate: calendar.startDate?.toISOString(),
      endDate: calendar.endDate?.toISOString(),
      isActive: calendar.isActive,
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

      // Get the currently active calendar for validation
      const currentActiveCalendar = await queryRunner.manager.findOne(AcademicCalendar, {
        where: { schoolId, isActive: true },
      });

      // Validate that we're not setting a previous calendar as active
      const validation = AcademicCalendarUtils.canActivateCalendar(
        calendar.academicYear,
        currentActiveCalendar?.academicYear
      );

      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }

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

  // Term Methods
  async createTerm(dto: TermDto): Promise<TermDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First find or create the term
      let term = await this.termRepository.findOne({
        where: { name: dto.termName },
      });

      if (!term) {
        term = await queryRunner.manager.save(Term, {
          name: dto.termName,
          order: parseInt(dto.termName.split(' ')[1]),
        });
      }

      // Find the academic calendar
      const academicCalendar = await this.academicCalendarRepository.findOne({
        where: { academicYear: dto.academicYear },
      });

      if (!academicCalendar) {
        throw new NotFoundException('Academic calendar not found');
      }

      // Create the academic year entry
      const academicYear = await queryRunner.manager.save(AcademicYear, {
        academicCalendar,
        term,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent,
      });

      // If activating this term, deactivate others
      if (dto.isCurrent) {
        await queryRunner.manager.update(
          AcademicYear,
          {
            academicCalendar: { id: academicCalendar.id },
            isCurrent: true,
          },
          { isCurrent: false },
        );
        await queryRunner.manager.update(
          AcademicYear,
          { id: academicYear.id },
          { isCurrent: true },
        );
      }

      await queryRunner.commitTransaction();

      return {
        id: academicYear.id,
        termName: term.name,
        startDate: academicYear.startDate.toISOString(),
        endDate: academicYear.endDate.toISOString(),
        isCurrent: academicYear.isCurrent,
        academicYear: academicCalendar.academicYear,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create term', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Term Methods
  async getAvailableTerms(): Promise<Term[]> {
    return this.termRepository.find({ order: { order: 'ASC' } });
  }

  async getAcademicYearTerms(
    academicCalendarId?: string,
  ): Promise<AcademicYearTermDto[]> {
    const where: any = {};
    if (academicCalendarId) {
      where.academicCalendar = { id: academicCalendarId };
    }

    const academicYears = await this.academicYearRepository.find({
      where,
      relations: ['academicCalendar', 'term'],
      order: { term: { order: 'ASC' } },
    });

    return academicYears.map((ay) => ({
      id: ay.id,
      termId: ay.term.id,
      termName: ay.term.name,
      academicCalendarId: ay.academicCalendar.id,
      startDate: ay.startDate.toISOString(),
      endDate: ay.endDate.toISOString(),
      isCurrent: ay.isCurrent,
    }));
  }

  async activateAcademicYearTerm(id: string): Promise<AcademicYearTermDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const academicYear = await queryRunner.manager.findOne(AcademicYear, {
        where: { id },
        relations: ['academicCalendar', 'term'],
      });

      if (!academicYear) {
        throw new NotFoundException('Academic year term not found');
      }

      // First deactivate all other terms in this academic calendar
      await queryRunner.manager.update(
        AcademicYear,
        {
          academicCalendar: { id: academicYear.academicCalendar.id },
          isCurrent: true,
        },
        { isCurrent: false },
      );

      // Then activate this term
      academicYear.isCurrent = true;
      const updatedAcademicYear = await queryRunner.manager.save(
        AcademicYear,
        academicYear,
      );
      await queryRunner.commitTransaction();

      return {
        id: updatedAcademicYear.id,
        termId: academicYear.term.id,
        termName: academicYear.term.name, // Now matches DTO
        academicCalendarId: academicYear.academicCalendar.id,
        startDate: updatedAcademicYear.startDate.toISOString(),
        endDate: updatedAcademicYear.endDate.toISOString(),
        isCurrent: updatedAcademicYear.isCurrent,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to activate academic year term', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTerms(academicCalendarId?: string): Promise<TermDto[]> {
    const where: any = {};
    if (academicCalendarId) {
      where.academicCalendar = { id: academicCalendarId };
    }

    const academicYears = await this.academicYearRepository.find({
      where,
      relations: ['academicCalendar', 'term'],
      order: { term: { order: 'ASC' } },
    });

    return academicYears.map((ay) => ({
      id: ay.id,
      termName: ay.term.name,
      startDate: ay.startDate.toISOString(),
      endDate: ay.endDate.toISOString(),
      isCurrent: ay.isCurrent,
      academicYear: ay.academicCalendar.academicYear,
    }));
  }

  async updateTerm(id: string, dto: TermDto): Promise<TermDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const academicYear = await queryRunner.manager.findOne(AcademicYear, {
        where: { id },
        relations: ['academicCalendar', 'term'],
      });

      if (!academicYear) {
        throw new NotFoundException('Term not found');
      }

      academicYear.startDate = new Date(dto.startDate);
      academicYear.endDate = new Date(dto.endDate);
      academicYear.isCurrent = dto.isCurrent;

      // If activating this term, deactivate others
      if (dto.isCurrent) {
        await queryRunner.manager.update(
          AcademicYear,
          {
            academicCalendar: { id: academicYear.academicCalendar.id },
            isCurrent: true,
          },
          { isCurrent: false },
        );
      }

      const updatedAcademicYear = await queryRunner.manager.save(
        AcademicYear,
        academicYear,
      );
      await queryRunner.commitTransaction();

      return {
        id: updatedAcademicYear.id,
        termName: academicYear.term.name,
        startDate: updatedAcademicYear.startDate.toISOString(),
        endDate: updatedAcademicYear.endDate.toISOString(),
        isCurrent: updatedAcademicYear.isCurrent,
        academicYear: academicYear.academicCalendar.academicYear,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to update term', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Add this to your SettingsService class
  async createAcademicYearTerm(
    dto: CreateAcademicYearTermDto,
  ): Promise<AcademicYearTermDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get the active academic calendar
      const activeCalendar = await this.academicCalendarRepository.findOne({
        where: { isActive: true },
      });

      if (!activeCalendar) {
        throw new BadRequestException('No active academic calendar found');
      }

      // Get the term
      const term = await this.termRepository.findOne({
        where: { id: dto.termId },
      });

      if (!term) {
        throw new NotFoundException('Term not found');
      }

      // Check if this term already exists for the academic calendar
      const existingTerm = await this.academicYearRepository.findOne({
        where: {
          academicCalendar: { id: activeCalendar.id },
          term: { id: dto.termId },
        },
      });

      if (existingTerm) {
        throw new BadRequestException(
          'This term already exists for the academic year',
        );
      }

      // Create the academic year term
      const academicYearTerm = this.academicYearRepository.create({
        academicCalendar: activeCalendar,
        term,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent,
      });

      // If this term is being set as current, deactivate others
      if (dto.isCurrent) {
        await queryRunner.manager.update(
          AcademicYear,
          {
            academicCalendar: { id: activeCalendar.id },
            isCurrent: true,
          },
          { isCurrent: false },
        );
      }

      const savedTerm = await queryRunner.manager.save(academicYearTerm);
      await queryRunner.commitTransaction();

      return {
        id: savedTerm.id,
        termId: savedTerm.term.id,
        termName: savedTerm.term.name, // Now matches DTO
        academicCalendarId: savedTerm.academicCalendar.id,
        startDate: savedTerm.startDate.toISOString(),
        endDate: savedTerm.endDate.toISOString(),
        isCurrent: savedTerm.isCurrent,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create academic year term', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async activateTerm(id: string): Promise<TermDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const academicYear = await queryRunner.manager.findOne(AcademicYear, {
        where: { id },
        relations: ['academicCalendar', 'term'],
      });

      if (!academicYear) {
        throw new NotFoundException('Term not found');
      }

      // First deactivate all other terms in this academic calendar
      await queryRunner.manager.update(
        AcademicYear,
        {
          academicCalendar: { id: academicYear.academicCalendar.id },
          isCurrent: true,
        },
        { isCurrent: false },
      );

      // Then activate this term
      academicYear.isCurrent = true;
      const updatedAcademicYear = await queryRunner.manager.save(
        AcademicYear,
        academicYear,
      );
      await queryRunner.commitTransaction();

      return {
        id: updatedAcademicYear.id,
        termName: academicYear.term.name,
        startDate: updatedAcademicYear.startDate.toISOString(),
        endDate: updatedAcademicYear.endDate.toISOString(),
        isCurrent: updatedAcademicYear.isCurrent,
        academicYear: academicYear.academicCalendar.academicYear,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to activate term', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Helper Methods
  private async initializeDefaultTerms() {
    try {
      const termsCount = await this.termRepository.count();
      if (termsCount === 0) {
        const termsToCreate = [
          { name: 'Term 1', order: 1 },
          { name: 'Term 2', order: 2 },
          { name: 'Term 3', order: 3 },
        ];
        await this.termRepository.save(termsToCreate);
        this.logger.log('Default terms initialized successfully');
      }
    } catch (error) {
      this.logger.error('Failed to initialize default terms', error.stack);
      throw new InternalServerErrorException(
        'Failed to initialize default terms',
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
      where: { academicYear: academicCalendar.academicYear },
    });

    const calendarData: Partial<AcademicCalendar> = {
      academicYear: academicCalendar.academicYear,
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

  private async updateCurrentTerm(
    currentTerm: TermDto,
    queryRunner: QueryRunner,
  ) {
    const academicYear = await this.academicYearRepository.findOne({
      where: { id: currentTerm.id },
      relations: ['academicCalendar'],
    });

    if (!academicYear) {
      throw new NotFoundException('Term not found');
    }

    // Reset current flag on all terms if activating a new term
    if (currentTerm.isCurrent) {
      await queryRunner.manager.update(
        AcademicYear,
        {
          academicCalendar: { id: academicYear.academicCalendar.id },
          isCurrent: true,
        },
        { isCurrent: false },
      );
    }

    academicYear.startDate = new Date(currentTerm.startDate);
    academicYear.endDate = new Date(currentTerm.endDate);
    academicYear.isCurrent = currentTerm.isCurrent;

    await queryRunner.manager.save(AcademicYear, academicYear);
  }
async getCurrentAcademicYear(): Promise<{ id: string } | null> {
    try {
        const academicYear = await this.academicYearRepository.findOne({
            where: { isCurrent: true },
            select: ['id'],
        });
        return academicYear ? { id: academicYear.id } : null;
    } catch (error) {
        this.logger.error('Failed to get current academic year', error.stack);
        throw new InternalServerErrorException('Failed to get academic year');
    }
}

  async getAcademicYears(academicCalendarId?: string) {
    // If no calendar id provided, try active calendar
    let calendarId = academicCalendarId;
    if (!calendarId) {
      const active = await this.academicCalendarRepository.findOne({ where: { isActive: true }, select: ['id'] });
      calendarId = active?.id;
    }
    const where = calendarId ? { academicCalendar: { id: calendarId } } : {};
    const years = await this.academicYearRepository.find({ where, relations: ['term', 'academicCalendar'], order: { startDate: 'ASC' } });
    return years.map(y => ({
      id: y.id,
      academicCalendarId: y.academicCalendar?.id,
      termId: y.term?.id,
      termName: y.term?.name,
      startDate: y.startDate?.toISOString(),
      endDate: y.endDate?.toISOString(),
      isCurrent: y.isCurrent,
    }));
  }
}
