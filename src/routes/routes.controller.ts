import { Controller, Get, UseGuards } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/user/enums/role.enum';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ROUTES_GENERATED, GeneratedRouteMeta } from './routes.generated';

interface RouteMeta {
  method: string;       // HTTP method
  paths: string[];      // All concrete paths this handler responds to
  controller: string;   // Controller class name
  handler: string;      // Method name
  roles: string[];      // Effective roles required
}

@Controller('routes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class RoutesController {
  private cache: RouteMeta[] = [];
  private generatedWritten = false;

  constructor(
    private readonly modulesContainer: ModulesContainer,
    private readonly reflector: Reflector,
  ) {
    this.cache = this.collectRoutes();
    // Only write generated files if explicitly enabled to avoid watch restart loops
    if (process.env.GENERATE_ROUTES_ON_BOOT === 'true') {
      this.writeGeneratedFiles();
    }
  }

  @Get()
  list(): { count: number; routes: RouteMeta[] } {
    return { count: this.cache.length, routes: this.cache };
  }

  private collectRoutes(): RouteMeta[] {
    const routes: RouteMeta[] = [];
    const globalPrefix = 'api/v1'; // Should match global prefix in main.ts

    for (const moduleRef of this.modulesContainer.values()) {
      for (const ctrlWrapper of moduleRef.controllers.values()) {
        const controllerInstance = ctrlWrapper.instance;
        if (!controllerInstance) continue;
        const controllerClass = controllerInstance.constructor;
        const controllerPath = this.normalizePath(
          Reflect.getMetadata(PATH_METADATA, controllerClass),
        );
        const controllerLevelRoles =
          this.reflector.get<Role[]>('roles', controllerClass) || [];

        const prototype = controllerClass.prototype;
        for (const methodName of Object.getOwnPropertyNames(prototype)) {
          if (methodName === 'constructor') continue;
          const handler = prototype[methodName];
          const routePathMeta = Reflect.getMetadata(PATH_METADATA, handler);
          const methodMeta = Reflect.getMetadata(METHOD_METADATA, handler);
          if (methodMeta === undefined) continue; // Not a route handler

          const method = RequestMethod[methodMeta];
          const methodLevelRoles =
            this.reflector.get<Role[]>('roles', handler) || [];

          const effectiveRoles =
            methodLevelRoles.length > 0
              ? methodLevelRoles
              : controllerLevelRoles;

          const routePaths = this.resolvePaths(controllerPath, routePathMeta)
            .map((p) => `/${globalPrefix}${p}`.replace(/\/+/g, '/'));

          routes.push({
            method,
            paths: routePaths,
            controller: controllerClass.name,
            handler: methodName,
            roles: effectiveRoles,
          });
        }
      }
    }

    return routes.sort(
      (a, b) =>
        a.paths[0].localeCompare(b.paths[0]) || a.method.localeCompare(b.method),
    );
  }

  private writeGeneratedFiles() {
    if (this.generatedWritten) return;
    try {
      const flat: GeneratedRouteMeta[] = this.cache.flatMap((r) =>
        r.paths.map((p) => ({
          method: r.method,
          path: p,
          controller: r.controller,
          handler: r.handler,
          roles: r.roles,
        })),
      );

      const routesDir = path.join(process.cwd(), 'src', 'routes');
      if (!fs.existsSync(routesDir)) {
        fs.mkdirSync(routesDir, { recursive: true });
      }

      const tsFile = path.join(routesDir, 'routes.generated.ts');
      const jsonFile = path.join(routesDir, 'routes.generated.json');

      const header = `// AUTO-GENERATED ROUTES MAP\n// Generated at: ${new Date().toISOString()}\n// Do NOT edit manually.\n\n`;
      const body = `export interface GeneratedRouteMeta {\n  method: string;\n  path: string;\n  controller: string;\n  handler: string;\n  roles: string[];\n}\n\nexport const ROUTES_GENERATED: GeneratedRouteMeta[] = ${JSON.stringify(flat, null, 2)};\n`;

      // Only write if content changed to avoid triggering watchers unnecessarily
      const newTsContent = header + body;
      const newJsonContent = JSON.stringify({ generatedAt: new Date().toISOString(), routes: flat }, null, 2);

      const existingTs = fs.existsSync(tsFile) ? fs.readFileSync(tsFile, 'utf8') : '';
      const existingJson = fs.existsSync(jsonFile) ? fs.readFileSync(jsonFile, 'utf8') : '';

      if (existingTs !== newTsContent) fs.writeFileSync(tsFile, newTsContent, 'utf8');
      if (existingJson !== newJsonContent) fs.writeFileSync(jsonFile, newJsonContent, 'utf8');

      this.generatedWritten = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[RoutesController] Failed to write generated routes file:', err);
    }
  }

  private resolvePaths(controllerPath: string, routePathMeta: any): string[] {
    const methodPaths: string[] = [];
    const raw = routePathMeta ?? '';
    const routePaths = Array.isArray(raw) ? raw : [raw];
    for (const r of routePaths) {
      const full = [controllerPath, this.normalizePath(r)]
        .filter(Boolean)
        .join('/');
      methodPaths.push(
        '/' + full.replace(/^\/+/, '').replace(/\/+/g, '/'),
      );
    }
    return methodPaths;
  }

  private normalizePath(p: any): string {
    if (!p) return '';
    return String(p).replace(/^\/+/, '').replace(/\/+$/, '');
  }
}
