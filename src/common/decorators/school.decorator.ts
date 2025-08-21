import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface TenantContext {
  userId: string;
  role: string;
  schoolId: string | null;
}

export const SchoolContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return {
      userId: request.user?.sub,
      role: request.user?.role,
      schoolId: request.schoolId ?? request.user?.schoolId ?? null,
    };
  },
);
