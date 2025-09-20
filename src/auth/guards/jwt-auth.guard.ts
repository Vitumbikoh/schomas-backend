import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../auth.guard';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
  ) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Delegate to the parent AuthGuard('jwt') which uses JwtStrategy
    console.log('JWT_GUARD - Delegating to parent AuthGuard(jwt)');
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    console.log('JWT_GUARD - handleRequest called');
    console.log('JWT_GUARD - handleRequest err:', err);
    console.log('JWT_GUARD - handleRequest info:', info);
    console.log('JWT_GUARD - handleRequest user:', JSON.stringify(user, null, 2));
    
    if (err || !user) {
      console.error('JWT_GUARD - Authentication failed:', err || 'No user found');
      throw err || new Error('Unauthorized');
    }
    
    console.log('JWT_GUARD - Authentication successful, returning user');
    return user;
  }
}
