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

  async validateUser(email: string, password: string): Promise<any> {
    console.log('Trying to login with:', email, password);
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
        console.log('User not found');
        return null; // Return null instead of throwing error for Passport compatibility
    }
    
    console.log('Found user:', user);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
        console.log('Invalid password');
        return null;
    }
    
    if (!user.isActive) { // Assuming you have an isActive field
        console.log('User inactive');
        return null;
    }
    
    const { password: _, ...result } = user;
    return result;
}
  

  async login(user: User) {
    const payload = { 
      email: user.email, 
      sub: user.id,
      role: user.role 
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
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