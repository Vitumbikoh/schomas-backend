import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/user/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

  const { user } = context.switchToHttp().getRequest();
  if (!user) return false;
  // SUPER_ADMIN has access to all roles
  if (user.role === Role.SUPER_ADMIN) return true;
  return requiredRoles.includes(user.role as Role);
  }
}