import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { User } from '../user/entities/user.entity';
import { ConfigService } from '../config/config.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    console.log('Validating JWT payload:', payload);
    try {
      const user = await this.authService.validateToken(payload.sub);
      if (!user) {
        console.error('User not found for ID:', payload.sub);
        throw new UnauthorizedException('User not found');
      }
      return {
        sub: user.id, // Changed from 'id' to 'sub' to match JWT payload and controller expectations
        email: user.email,
        role: user.role,
      };
    } catch (error) {
      console.error('JWT validation error:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
}