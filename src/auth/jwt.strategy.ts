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

  // async validate(payload: any): Promise<User> {
  //   const user = await this.authService.validateToken(payload.sub);
  //   if (!user) {
  //     throw new Error('User not found');
  //   }
  //   return user;
  // }

  // async validate(payload: any) {
  //   console.log('JWT Payload:', payload); // Debug payload
  //   const user = await this.authService.validateToken(payload.sub);
  //   if (!user) {
  //     console.log('User not found for ID:', payload.sub); // Debug
  //     throw new UnauthorizedException();
  //   }
  //   console.log('Validated user:', user); // Debug
  //   return user; // Return full user object
  // }

  async validate(payload: any) {
    console.log('Validating JWT payload:', payload);
    try {
      const user = await this.authService.validateToken(payload.sub);
      if (!user) {
        console.error('User not found for ID:', payload.sub);
        throw new UnauthorizedException('User not found');
      }
      return {
        id: user.id,
        email: user.email,
        role: user.role
      };
    } catch (error) {
      console.error('JWT validation error:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
}