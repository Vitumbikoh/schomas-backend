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
    console.log('JWT_STRATEGY - Validating JWT payload:', JSON.stringify(payload, null, 2));
    try {
      const user = await this.authService.validateToken(payload.sub);
      if (!user) {
        console.error('JWT_STRATEGY - User not found for ID:', payload.sub);
        throw new UnauthorizedException('User not found');
      }
      console.log('JWT_STRATEGY - User found from DB:', { id: user.id, username: user.username, role: user.role });
      const result = {
        id: user.id, // Map sub to id for controller access
        sub: user.id, // Keep sub for backward compatibility
        username: user.username,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId || null,
      };
      console.log('JWT_STRATEGY - Returning user object:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('JWT_STRATEGY - Validation error:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
}