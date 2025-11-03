import { Controller, Get, Put, Body, Request, UseGuards, ValidationPipe, UsePipes, Query } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto, ProfileResponseDto, ProfileActivityDto, ProfileStatsDto } from './dto/profile.dto';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getProfile(@Request() req): Promise<ProfileResponseDto> {
    const userId = req.user?.sub || req.user?.id;
    return this.profileService.getProfile(userId);
  }

  @Put()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateProfile(@Request() req, @Body() updateData: UpdateProfileDto): Promise<ProfileResponseDto> {
    const userId = req.user?.sub || req.user?.id;
    return this.profileService.updateProfile(userId, updateData);
  }

  @Get('activities')
  async getProfileActivities(@Request() req, @Query('limit') limit?: string): Promise<ProfileActivityDto[]> {
    const userId = req.user?.sub || req.user?.id;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.profileService.getProfileActivities(userId, limitNumber);
  }

  @Get('stats')
  async getProfileStats(@Request() req): Promise<ProfileStatsDto> {
    const userId = req.user?.sub || req.user?.id;
    return this.profileService.getProfileStats(userId);
  }
}
