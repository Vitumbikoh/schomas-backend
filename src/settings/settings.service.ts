import { Injectable, NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { User } from '../user/entities/user.entity';
import { SchoolSettings } from './entities/school-settings.entity';
import { Role } from '../user/enums/role.enum';
import { Teacher } from '../user/entities/teacher.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { Finance } from '../user/entities/finance.entity';
import * as bcrypt from 'bcrypt';
import { SettingsResponseDto, UpdateSettingsDto } from './dtos/settings.dto';

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
  ) {}

  async getSettings(userId: string): Promise<SettingsResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    try {
      // Find user with related entities
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings', 'teacher', 'student', 'parent', 'finance'],
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Ensure settings exist or create default ones
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
        user.settings = await this.userSettingsRepository.save(newSettings);
        await this.userRepository.save(user);
      }

      // Get phone number from related entity based on role
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

      // Get school settings if user is admin
      let schoolSettings: SchoolSettings | null = null;
      if (user.role === Role.ADMIN) {
        schoolSettings = await this.schoolSettingsRepository.findOne({
          where: { id: 'default-school-settings' },
        });
        if (!schoolSettings) {
          schoolSettings = this.schoolSettingsRepository.create({
            id: 'default-school-settings',
            schoolName: '',
            schoolEmail: '',
            schoolPhone: '',
            schoolAddress: '',
            schoolAbout: '',
          });
          await this.schoolSettingsRepository.save(schoolSettings);
        }
      }

      // Build response DTO
      return {
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
        schoolSettings: schoolSettings ? {
          schoolName: schoolSettings.schoolName,
          schoolEmail: schoolSettings.schoolEmail,
          schoolPhone: schoolSettings.schoolPhone,
          schoolAddress: schoolSettings.schoolAddress,
          schoolAbout: schoolSettings.schoolAbout,
        } : undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to get settings for user ${userId}`, error.stack);
      if (error instanceof QueryFailedError && error.message.includes('invalid input syntax for type uuid')) {
        throw new InternalServerErrorException('Invalid school settings ID format');
      }
      throw new InternalServerErrorException('Failed to retrieve user settings');
    }
  }

  async updateSettings(userId: string, updateDto: UpdateSettingsDto): Promise<SettingsResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings', 'teacher', 'student', 'parent', 'finance'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Ensure settings exist
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
      user.settings = await this.userSettingsRepository.save(newSettings);
    }

    // Handle password update
    if (updateDto.currentPassword && updateDto.newPassword) {
      this.logger.log(`Attempting password update for user ${userId}`);
      const isPasswordValid = await bcrypt.compare(updateDto.currentPassword, user.password);
      if (!isPasswordValid) {
        this.logger.warn(`Invalid current password for user ${userId}`);
        throw new UnauthorizedException('Current password is incorrect');
      }
      user.password = await bcrypt.hash(updateDto.newPassword, 10);
      this.logger.log(`Password updated successfully for user ${userId}`);
    } else if (updateDto.currentPassword || updateDto.newPassword) {
      throw new BadRequestException('Both current and new passwords are required');
    }

    // Update user details
    if (updateDto.username) user.username = updateDto.username;
    if (updateDto.email) user.email = updateDto.email;

    // Update phone number in the appropriate entity
    if (updateDto.phone) {
      if (user.role === Role.TEACHER) {
        if (!user.teacher) {
          const newTeacher = this.teacherRepository.create({ phoneNumber: updateDto.phone });
          newTeacher.user = user;
          user.teacher = await this.teacherRepository.save(newTeacher);
        } else {
          user.teacher.phoneNumber = updateDto.phone;
          await this.teacherRepository.save(user.teacher);
        }
      } else if (user.role === Role.STUDENT) {
        if (!user.student) {
          const newStudent = this.studentRepository.create({ phoneNumber: updateDto.phone });
          newStudent.user = user;
          user.student = await this.studentRepository.save(newStudent);
        } else {
          user.student.phoneNumber = updateDto.phone;
          await this.studentRepository.save(user.student);
        }
      } else if (user.role === Role.PARENT) {
        if (!user.parent) {
          const newParent = this.parentRepository.create({ phoneNumber: updateDto.phone });
          newParent.user = user;
          user.parent = await this.parentRepository.save(newParent);
        } else {
          user.parent.phoneNumber = updateDto.phone;
          await this.parentRepository.save(user.parent);
        }
      } else if (user.role === Role.FINANCE) {
        if (!user.finance) {
          const newFinance = this.financeRepository.create({ phoneNumber: updateDto.phone });
          newFinance.user = user;
          user.finance = await this.financeRepository.save(newFinance);
        } else {
          user.finance.phoneNumber = updateDto.phone;
          await this.financeRepository.save(user.finance);
        }
      } else if (user.role === Role.ADMIN) {
        user.phone = updateDto.phone;
      }
    }

    // Update user settings
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

    await this.userSettingsRepository.save(user.settings);
    await this.userRepository.save(user);

    // Update school settings (admin only)
    let schoolSettings: SchoolSettings | undefined;
    if (updateDto.schoolSettings) {
      if (user.role !== Role.ADMIN) {
        throw new ForbiddenException('Only admins can update school settings');
      }
      const existingSettings = await this.schoolSettingsRepository.findOne({
        where: { id: 'default-school-settings' },
      });
      
      if (!existingSettings) {
        schoolSettings = this.schoolSettingsRepository.create({
          id: 'default-school-settings',
          ...updateDto.schoolSettings,
        });
      } else {
        schoolSettings = this.schoolSettingsRepository.merge(
          existingSettings,
          updateDto.schoolSettings,
        );
      }
      schoolSettings = await this.schoolSettingsRepository.save(schoolSettings);
    }

    return this.getSettings(userId);
  }
}