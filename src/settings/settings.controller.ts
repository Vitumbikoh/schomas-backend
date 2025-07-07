import { Controller, Get, Patch, Body, UseGuards, Request, UnauthorizedException, Logger } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsResponseDto, UpdateSettingsDto } from './dtos/settings.dto';

@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(private readonly settingsService: SettingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getSettings(@Request() req): Promise<SettingsResponseDto> {
    this.logger.log(`GET /settings for user: ${JSON.stringify(req.user)}`);
    if (!req.user || !req.user.sub) {
      this.logger.error('Invalid user object in request:', JSON.stringify(req.user));
      throw new UnauthorizedException('Invalid user credentials: User ID (sub) missing');
    }

    return await this.settingsService.getSettings(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateSettings(
    @Request() req,
    @Body() updateDto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    this.logger.log(`PATCH /settings for user: ${JSON.stringify(req.user)}, body: ${JSON.stringify(updateDto)}`);
    if (!req.user || !req.user.sub) {
      this.logger.error('Invalid user object in request:', JSON.stringify(req.user));
      throw new UnauthorizedException('Invalid user credentials: User ID (sub) missing');
    }
    return this.settingsService.updateSettings(req.user.sub, updateDto);
  }
}