import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Role } from '../../user/enums/role.enum';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;

    if (user.role === Role.SUPER_ADMIN) {
      const paramSchoolId = req.params?.schoolId || req.params?.school || null;
      const headerSchoolId = req.headers['x-school-id'] as string | undefined;
      const querySchoolId = req.query?.schoolId as string | undefined;
      const chosen = paramSchoolId || headerSchoolId || querySchoolId || null;
      req.schoolId = chosen; // can be null for global operations
      return true;
    }

    if (!user.schoolId) {
      throw new ForbiddenException('User not assigned to a school');
    }
    req.schoolId = user.schoolId;
    return true;
  }
}
