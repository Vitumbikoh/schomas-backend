import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';
import { LoginDto } from 'src/user/dtos/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Request() req) {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify')
  async verifyToken(@Request() req) {
    return { valid: true, user: req.user };
  }

  @Public()
  @Post('validate-token')
  async validateToken(@Body() body: { token: string }) {
    try {
      const user = this.authService.validateToken(body.token);
      return { valid: true, user };
    } catch (e) {
      return { valid: false };
    }
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: { refresh_token: string }) {
    if (!body?.refresh_token) {
      return { error: 'refresh_token required' } as any;
    }
    return this.authService.refresh(body.refresh_token);
  }
}
