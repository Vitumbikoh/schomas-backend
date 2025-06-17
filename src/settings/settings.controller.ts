import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsResponseDto, UpdateSettingsDto } from './dtos/settings.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getSettings(@Request() req) {
    console.log('Request user:', req.user);
    if (!req.user?.id) {
      console.error('Invalid user object in request:', req.user);
      throw new UnauthorizedException('Invalid user credentials');
    }

    try {
      return await this.settingsService.getSettings(req.user.id);
    } catch (error) {
      console.error('Settings error:', error);
      throw new UnauthorizedException('Failed to fetch settings');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateSettings(
    @Request() req,
    @Body() updateDto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    return this.settingsService.updateSettings(req.user.id, updateDto);
  }
}
