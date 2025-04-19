import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';
import { LoginDto } from 'src/user/dtos/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Request() req) {
    return this.authService.login(req.user);
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
}