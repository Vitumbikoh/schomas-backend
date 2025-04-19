// src/common/middleware/rbac.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RolePermissions, Resource, Action } from '../types/permissions';

@Injectable()
export class RBACMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const user = req.user as { role: string }; // Assuming user is attached to request
    
    if (!user || !user.role) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const resource = this.getResourceFromPath(req.path);
    const action = this.getActionFromMethod(req.method);

    const hasPermission = RolePermissions[user.role]?.some(permission => 
      permission.resource === resource && 
      permission.actions.includes(action)
    );

    if (!hasPermission) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    next();
  }

  private getResourceFromPath(path: string): string {
    // Extract resource from path (e.g., '/students' -> 'student')
    const parts = path.split('/').filter(Boolean);
    return parts.length > 0 ? parts[0].replace(/s$/, '') : '';
  }

  private getActionFromMethod(method: string): string {
    const methodMap = {
      GET: Action.READ,
      POST: Action.CREATE,
      PUT: Action.UPDATE,
      PATCH: Action.UPDATE,
      DELETE: Action.DELETE,
    };
    return methodMap[method.toUpperCase()] || Action.READ;
  }
}