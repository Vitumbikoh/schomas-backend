import { Injectable, NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { User } from '../user/entities/user.entity';
import { SchoolSettings } from './entities/school-settings.entity';
import { SettingsResponseDto, UpdateSettingsDto } from './dtos/settings.dto';
import { Role } from '../user/enums/role.enum'; // Import the Role enum

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
  ) {}

  async getSettings(userId: string): Promise<SettingsResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }
  
    try {
      // Find user with settings relation
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings'],
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
          }
        });
        
        user.settings = await this.userSettingsRepository.save(newSettings);
        await this.userRepository.save(user);
      }
  
      // Get school settings if user is admin
      let schoolSettings: SchoolSettings | null = null;
      if (user.role === Role.ADMIN) {
        schoolSettings = await this.schoolSettingsRepository.findOne({
          where: { id: 'default-school-settings' },
        });
      }
  
      // Build response DTO
      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          phone: user.phone,
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
        } : undefined
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to get settings for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve user settings');
    }
  }

  async updateSettings(userId: string, updateDto: UpdateSettingsDto): Promise<SettingsResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update user details
    if (updateDto.username) user.username = updateDto.username;
    if (updateDto.email) user.email = updateDto.email;
    if (updateDto.phone) user.phone = updateDto.phone;

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

    await this.userRepository.save(user);
    await this.userSettingsRepository.save(user.settings);

    // Update school settings (admin only)
    let schoolSettings: SchoolSettings | undefined;
    if (updateDto.schoolSettings) {
      if (user.role !== Role.ADMIN) { // Use Role enum instead of UserRole
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
          updateDto.schoolSettings
        );
      }
      schoolSettings = await this.schoolSettingsRepository.save(schoolSettings);
    }

    return this.getSettings(userId);
  }
}