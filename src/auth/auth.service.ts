import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { UsersService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  // NOTE: For production, store refresh tokens in DB with rotation and revocation support.
  private refreshTokens = new Map<string, { userId: string; expiresAt: number }>();

  async validateUser(identifier: string, password: string): Promise<any> {
    // identifier is expected to be username, but we fallback to email for backward compatibility
    const trimmed = (identifier || '').trim();
    if (!trimmed) {
      console.log('[AUTH] Empty identifier provided');
      return null;
    }

    console.log('[AUTH] Login attempt:', { identifier: trimmed });

    let user = await this.usersService.findByUsername(trimmed);

    if (!user) {
      // Backward compatibility: allow using email if username not found
      user = await this.usersService.findByEmail(trimmed);
      if (user) {
        console.log('[AUTH] Matched by email fallback');
      }
    }

    if (!user) {
      console.log('[AUTH] User not found for identifier');
      return null; // Passport expects null for failure
    }

    // Password verification
    const storedPassword = user.password || '';
    let isPasswordValid = false;
    try {
      // If stored password looks like a bcrypt hash, compare; else direct compare (legacy plain-text) then rehash path could be added later
      const looksHashed = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');
      if (looksHashed) {
        isPasswordValid = await bcrypt.compare(password, storedPassword);
      } else {
        isPasswordValid = password === storedPassword;
      }
    } catch (e) {
      console.log('[AUTH] Password compare error', e);
      return null;
    }

    if (!isPasswordValid) {
      console.log('[AUTH] Invalid password');
      return null;
    }

    // Treat null/undefined isActive as true (legacy rows) but block explicit false
    if (user.isActive === false) {
      console.log('[AUTH] User inactive');
      return null;
    }

    const { password: _pw, ...result } = user;
    console.log('[AUTH] Login success:', { id: user.id, username: user.username, role: user.role });
    return result;
  }
  

  async login(user: User) {
    // Update login and activity timestamps
    const now = new Date();
    await this.usersService.updateLoginActivity(user.id, now, now);
    
    const payload = { 
      username: user.username,
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId || null,
    };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.issueRefreshToken(user.id);
    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        schoolId: user.schoolId || null,
        forcePasswordReset: (user as any).forcePasswordReset ?? false,
      },
    };
  }

  private issueRefreshToken(userId: string) {
    const token = this.generateRandomToken();
    const ttlMs = 1000 * 60 * 60 * 24 * 7; // 7 days
    this.refreshTokens.set(token, { userId, expiresAt: Date.now() + ttlMs });
    return token;
  }

  private generateRandomToken() {
    // Simple random; in production use crypto.randomBytes(32).toString('hex')
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  async refresh(refreshToken: string) {
    const record = this.refreshTokens.get(refreshToken);
    if (!record) throw new UnauthorizedException('Invalid refresh token');
    if (Date.now() > record.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      throw new UnauthorizedException('Refresh token expired');
    }
    const user = await this.usersService.findById(record.userId);
    if (!user || user.isActive === false) throw new UnauthorizedException('User inactive');
    const payload = { username: user.username, sub: user.id, role: user.role, schoolId: user.schoolId || null };
    const access_token = this.jwtService.sign(payload);
    // Optional rotation
    this.refreshTokens.delete(refreshToken);
    const new_refresh_token = this.issueRefreshToken(user.id);
    return { access_token, refresh_token: new_refresh_token };
  }

  async validateToken(userId: string): Promise<User> {
    console.log('AuthService.validateToken - Validating userId:', userId);
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      console.log('AuthService.validateToken - User not found or inactive:', { userId, user: user ? 'found but inactive' : 'not found' });
      throw new Error('User not found or inactive');
    }
    console.log('AuthService.validateToken - User validated successfully:', { id: user.id, username: user.username, role: user.role });
    return user;
  }

  
}