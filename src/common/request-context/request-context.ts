import { AsyncLocalStorage } from 'async_hooks';
import { Request } from 'express';

export interface RequestUser {
  id: string;
  email?: string | null;
  role: string;
  schoolId?: string | null;
  name?: string | null;
}

export interface RequestContextData {
  requestId: string;
  user?: RequestUser;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export class RequestContext {
  static run(data: RequestContextData, callback: () => void) {
    storage.run(data, callback);
  }

  static get(): RequestContextData | undefined {
    return storage.getStore();
  }

  static bindRequest(req: Request) {
    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    const user = req.user as any;
    const data: RequestContextData = {
      requestId,
      user: user
        ? {
            id: user.id,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            name: user.name || user.fullName || undefined,
          }
        : undefined,
      ip: (req.ip || (req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim(),
      userAgent: req.headers['user-agent'] as string,
    };
    return data;
  }
}
