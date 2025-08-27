import { Controller, Get, Put, Body, Request, UseGuards, ValidationPipe, UsePipes } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto, ProfileResponseDto } from './dto/profile.dto';

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
}
