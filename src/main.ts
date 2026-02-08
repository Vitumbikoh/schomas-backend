import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global pipes, filters, and interceptors
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // API prefix
  app.setGlobalPrefix('api/v1');

  // CORS configuration: allow list via CORS_ORIGIN env (comma-separated)
  let corsEnv: string | undefined;
  try {
    corsEnv = configService.get('CORS_ORIGIN');
  } catch (e) {
    corsEnv = undefined;
  }

  const allowedOrigins = corsEnv ? corsEnv.split(',').map(s => s.trim()) : ['http://localhost:8080'];

  app.enableCors({
    origin: (origin, callback) => {
      // allow non-browser requests (like curl, server-to-server) without origin
      if (!origin) return callback(null, true);
      // direct match from configured allowed origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // also accept common local dev hosts on port 3000
      try {
        const parsed = new URL(origin);
        const host = parsed.hostname;
        const port = parsed.port;
        if ((host === 'localhost' || host === '127.0.0.1') && port === '3000') {
          return callback(null, true);
        }
      } catch (e) {
        // if origin is not a valid URL, fall through to reject
      }
      // otherwise reject to avoid silently allowing unexpected origins
      return callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('School Management System API')
    .setDescription('API documentation for the School Management System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(configService.get('PORT') || 5000);
}
bootstrap();