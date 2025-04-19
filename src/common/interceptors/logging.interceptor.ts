import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { tap } from 'rxjs/operators';
  import { Request } from 'express';
  
  export class Logger {
    private static logLevel = process.env.LOG_LEVEL || 'debug';
  
    static log(message: string, context?: string) {
      if (['debug', 'info', 'warn', 'error'].includes(this.logLevel)) {
        console.log(`[LOG] ${new Date().toISOString()} [${context || 'App'}] ${message}`);
      }
    }
  
    static error(message: string, trace: string, context?: string) {
      console.error(`[ERROR] ${new Date().toISOString()} [${context || 'App'}] ${message}`);
      if (trace) {
        console.error(trace);
      }
    }
  
    static warn(message: string, context?: string) {
      if (['debug', 'info', 'warn'].includes(this.logLevel)) {
        console.warn(`[WARN] ${new Date().toISOString()} [${context || 'App'}] ${message}`);
      }
    }
  
    static debug(message: string, context?: string) {
      if (this.logLevel === 'debug') {
        console.debug(`[DEBUG] ${new Date().toISOString()} [${context || 'App'}] ${message}`);
      }
    }
  }
  
  @Injectable()
  export class LoggingInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const request = context.switchToHttp().getRequest<Request>();
      const { method, url, body, query, params } = request;
  
      Logger.debug(
        `Request: ${method} ${url} \nBody: ${JSON.stringify(body)} \nQuery: ${JSON.stringify(query)} \nParams: ${JSON.stringify(params)}`,
        'LoggingInterceptor',
      );
  
      const now = Date.now();
      return next.handle().pipe(
        tap((response) => {
          Logger.debug(
            `Response: ${method} ${url} ${Date.now() - now}ms \nResponse: ${JSON.stringify(response)}`,
            'LoggingInterceptor',
          );
        }),
      );
    }
  }