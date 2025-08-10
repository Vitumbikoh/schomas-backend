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
import { QueryFailedError, QueryRunner, Repository } from 'typeorm';
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

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private isInitialized = false;

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
  ) {
    this.initializeDefaultTerms();
  }

  private async initializeDefaultTerms() {
    if (this.isInitialized) return;

    try {
      const termsCount = await this.termRepository.count();
      if (termsCount === 0) {
        const defaultAcademicYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

        // Create default academic calendar if it doesn't exist
        const academicCalendar = await this.academicCalendarRepository.findOne({
          where: { academicYear: defaultAcademicYear },
        });

        if (!academicCalendar) {
          await this.academicCalendarRepository.save({
            academicYear: defaultAcademicYear,
            startDate: new Date(`${new Date().getFullYear()}-09-01`), // Default start date
            endDate: new Date(`${new Date().getFullYear() + 1}-06-30`), // Default end date
          });
        }

        // Create default terms
        const defaultTerms = [
          {
            termName: 'Term 1',
            academicYear: defaultAcademicYear,
            isCurrent: false,
          },
          {
            termName: 'Term 2',
            academicYear: defaultAcademicYear,
            isCurrent: false,
          },
          {
            termName: 'Term 3',
            academicYear: defaultAcademicYear,
            isCurrent: false,
          },
        ];

        await this.termRepository.save(defaultTerms);
        this.logger.log('Default terms initialized successfully');
      }
      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize default terms', error.stack);
    }
  }

  async getSettings(userId: string): Promise<SettingsResponseDto> {
    if (!userId) {
      this.logger.error('User ID is required');
      throw new BadRequestException('User ID is required');
    }

    try {
      this.logger.log(`Fetching settings for user ${userId}`);

      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings', 'teacher', 'student', 'parent', 'finance'],
      });

      if (!user) {
        this.logger.error(`User with ID ${userId} not found`);
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Initialize default settings if they don't exist
      if (!user.settings) {
        this.logger.log(`Creating default settings for user ${userId}`);
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

      // Get phone number based on role
      let phone: string | undefined;
      if (user.role === Role.TEACHER && user.teacher) {
        phone = user.teacher.phoneNumber;
      } else if (user.role === Role.STUDENT && user.student) {
        phone = user.student.phoneNumber;
      } else if (user.role === Role.PARENT && user.parent) {
        phone = user.parent.phoneNumber;
      } else if (user.role === Role.FINANCE && user.finance) {
        phone = user.finance.phoneNumber;
      } else if (user.role === Role.ADMIN) {
        phone = user.phone;
      }

      // Initialize response object
      const response: SettingsResponseDto = {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          phone,
          image: user.image,
          notifications: user.settings.notifications,
          security: user.settings.security,
        },
      };

      // Only include admin-specific settings if user is admin
      if (user.role === Role.ADMIN) {
        // School settings
        let schoolSettings = await this.schoolSettingsRepository.findOne({
          where: { id: 'default-school-settings' },
        });

        if (!schoolSettings) {
          this.logger.log('Creating default school settings');
          schoolSettings = this.schoolSettingsRepository.create({
            id: 'default-school-settings',
            schoolName: '',
            schoolEmail: '',
            schoolPhone: '',
            schoolAddress: '',
            schoolAbout: '',
          });
          schoolSettings =
            await this.schoolSettingsRepository.save(schoolSettings);
        }

        response.schoolSettings = {
          schoolName: schoolSettings.schoolName,
          schoolEmail: schoolSettings.schoolEmail,
          schoolPhone: schoolSettings.schoolPhone,
          schoolAddress: schoolSettings.schoolAddress,
          schoolAbout: schoolSettings.schoolAbout,
        };

        // Academic calendar
        const academicCalendar = await this.academicCalendarRepository.findOne({
          order: { createdAt: 'DESC' },
        });

        if (academicCalendar) {
          response.academicCalendar = {
            academicYear: academicCalendar.academicYear,
            startDate: academicCalendar.startDate?.toISOString(),
            endDate: academicCalendar.endDate?.toISOString(),
          };
        }

        // Current term
        // In settings.service.ts, modify the current term lookup:
        const currentTerm = await this.termRepository.findOne({
          where: {
            isCurrent: true,
            academicYear: academicCalendar?.academicYear, // Add academic year if available
          },
          order: { createdAt: 'DESC' }, // Add ordering for consistency
        });

        if (currentTerm) {
          response.currentTerm = {
            termName: currentTerm.termName,
            startDate: currentTerm.startDate?.toISOString(),
            endDate: currentTerm.endDate?.toISOString(),
            isCurrent: currentTerm.isCurrent,
            academicYear: currentTerm.academicYear,
          };
        }
      }

      this.logger.log(`Successfully retrieved settings for user ${userId}`);
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

 // In your SettingsService class
async updateSettings(
  userId: string,
  updateDto: UpdateSettingsDto,
  externalQueryRunner?: QueryRunner
): Promise<SettingsResponseDto> {
  // Determine if we need to manage the transaction lifecycle
  const shouldManageTransaction = !externalQueryRunner;
  const queryRunner = externalQueryRunner || 
    this.userRepository.manager.connection.createQueryRunner();

  if (shouldManageTransaction) {
    await queryRunner.connect();
    await queryRunner.startTransaction();
  }

  try {
    // 1. Get user with relations
    const user = await queryRunner.manager.findOne(User, {
      where: { id: userId },
      relations: ['settings', 'teacher', 'student', 'parent', 'finance'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // 2. Ensure settings exist
    if (!user.settings) {
      const newSettings = this.userSettingsRepository.create({
        notifications: { 
          email: true, 
          sms: false, 
          browser: true, 
          weeklySummary: true 
        },
        security: { 
          twoFactor: false 
        },
      });
      user.settings = await queryRunner.manager.save(UserSettings, newSettings);
      await queryRunner.manager.save(User, user);
    }

    // 3. Handle password update if provided
    if (updateDto.currentPassword && updateDto.newPassword) {
      const isPasswordValid = await bcrypt.compare(updateDto.currentPassword, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      if (updateDto.currentPassword === updateDto.newPassword) {
        throw new BadRequestException('New password must be different from current password');
      }
      user.password = await bcrypt.hash(updateDto.newPassword, 10);
    } else if (updateDto.currentPassword || updateDto.newPassword) {
      throw new BadRequestException('Both current and new passwords are required');
    }

    // 4. Update user details
    if (updateDto.username) user.username = updateDto.username;
    if (updateDto.email) user.email = updateDto.email;

    // 5. Update phone number based on role
    if (updateDto.phone) {
      await this.updatePhoneNumber(user, updateDto.phone, queryRunner);
    }

    // 6. Update user settings
    if (updateDto.notifications) {
      user.settings.notifications = {
        ...user.settings.notifications,
        ...updateDto.notifications,
      };
    }
    if (updateDto.security) {
      user.settings.security = {
        ...user.settings.security,
        ...updateDto.security,
      };
    }

    // 7. Save user and settings
    await queryRunner.manager.save(UserSettings, user.settings);
    await queryRunner.manager.save(User, user);

    // 8. Update school settings (admin only)
    if (updateDto.schoolSettings) {
      if (user.role !== Role.ADMIN) {
        throw new ForbiddenException('Only admins can update school settings');
      }
      await this.updateSchoolSettings(updateDto.schoolSettings, queryRunner);
    }

    // 9. Update academic calendar (admin only)
    if (updateDto.academicCalendar) {
      if (user.role !== Role.ADMIN) {
        throw new ForbiddenException('Only admins can update academic calendar');
      }
      await this.updateAcademicCalendar(updateDto.academicCalendar, queryRunner);
    }

    // 10. Update current term (admin only)
    if (updateDto.currentTerm) {
      if (user.role !== Role.ADMIN) {
        throw new ForbiddenException('Only admins can update terms');
      }
      await this.updateCurrentTerm(updateDto.currentTerm, queryRunner);
    }

    // 11. Commit transaction if we're managing it
    if (shouldManageTransaction) {
      await queryRunner.commitTransaction();
    }

    // 12. Return updated settings
    return await this.getSettings(userId);
  } catch (error) {
    // Rollback transaction if we're managing it
    if (shouldManageTransaction) {
      await queryRunner.rollbackTransaction();
    }
    this.logger.error(`Failed to update settings for user ${userId}`, error.stack);
    throw error;
  } finally {
    // Release query runner if we created it
    if (shouldManageTransaction) {
      await queryRunner.release();
    }
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
    queryRunner: QueryRunner,
  ) {
    const existingSettings = await queryRunner.manager.findOne(SchoolSettings, {
      where: { id: 'default-school-settings' },
    });

    if (!existingSettings) {
      await queryRunner.manager.save(SchoolSettings, {
        id: 'default-school-settings',
        ...schoolSettings,
      });
    } else {
      await queryRunner.manager.save(SchoolSettings, {
        ...existingSettings,
        ...schoolSettings,
      });
    }
  }

private async updateAcademicCalendar(
  academicCalendar: AcademicCalendarDto, 
  queryRunner: QueryRunner
): Promise<void> {
  try {
    const existingCalendar = await queryRunner.manager.findOne(AcademicCalendar, {
      where: { academicYear: academicCalendar.academicYear },
    });

    const calendarData: Partial<AcademicCalendar> = {
      academicYear: academicCalendar.academicYear,
      startDate: academicCalendar.startDate ? new Date(academicCalendar.startDate) : undefined,
      endDate: academicCalendar.endDate ? new Date(academicCalendar.endDate) : undefined,
    };

    if (existingCalendar) {
      await queryRunner.manager.save(AcademicCalendar, {
        ...existingCalendar,
        ...calendarData
      });
    } else {
      await queryRunner.manager.save(AcademicCalendar, calendarData);
    }
  } catch (error) {
    this.logger.error('Failed to update academic calendar', error.stack);
    throw error;
  }
}

  private async updateCurrentTerm(
    currentTerm: TermDto,
    queryRunner: QueryRunner,
  ) {
    // Reset current flag on all terms if activating a new term
    if (currentTerm.isCurrent) {
      await queryRunner.manager.update(
        Term,
        { isCurrent: true },
        { isCurrent: false },
      );
    }

    // Find existing term for this academic year and term name
    const existingTerm = await queryRunner.manager.findOne(Term, {
      where: {
        termName: currentTerm.termName,
        academicYear: currentTerm.academicYear,
      },
    });

    const termData: Partial<Term> = {
      termName: currentTerm.termName,
      academicYear: currentTerm.academicYear,
      isCurrent: currentTerm.isCurrent,
    };

    if (currentTerm.startDate) {
      termData.startDate = new Date(currentTerm.startDate);
    } else if (existingTerm?.startDate) {
      termData.startDate = existingTerm.startDate;
    }

    if (currentTerm.endDate) {
      termData.endDate = new Date(currentTerm.endDate);
    } else if (existingTerm?.endDate) {
      termData.endDate = existingTerm.endDate;
    }

    if (existingTerm) {
      await queryRunner.manager.save(Term, {
        ...existingTerm,
        ...termData,
      });
    } else {
      await queryRunner.manager.save(Term, termData);
    }
  }

  async getTerms(academicYear?: string): Promise<Term[]> {
    const where: any = {};
    if (academicYear) {
      where.academicYear = academicYear;
    }

    return this.termRepository.find({
      where,
      order: { termName: 'ASC' },
    });
  }

  async deactivateAllTerms(): Promise<void> {
    await this.termRepository.update({ isCurrent: true }, { isCurrent: false });
  }

  async activateTerm(id: string): Promise<Term> {
    const term = await this.termRepository.findOne({ where: { id } });
    if (!term) {
      throw new NotFoundException(`Term with ID ${id} not found`);
    }

    term.isCurrent = true;
    return this.termRepository.save(term);
  }
}
