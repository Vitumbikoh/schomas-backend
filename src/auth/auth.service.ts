import { Injectable } from '@nestjs/common';
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
    const payload = { 
      username: user.username,
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId || null,
    };
    return {
      access_token: this.jwtService.sign(payload),
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

  async validateToken(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }
    return user;
  }

  
}