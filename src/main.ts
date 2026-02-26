import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { networkInterfaces } from 'os';

const isPrivateIpv4Host = (host: string): boolean => {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split('.').map((s) => Number.parseInt(s, 10));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Ensure critical one-off tables exist (e.g., student_academic_history created by manual SQL)
  try {
    const dataSource = app.get(require('typeorm').DataSource) as import('typeorm').DataSource;
    if (dataSource) {
      const existsRes = await dataSource.query("SELECT to_regclass('public.student_academic_history') as reg");
      const exists = existsRes && existsRes[0] && (existsRes[0].reg || existsRes[0].to_regclass);
      if (!exists) {
        const fs = require('fs');
        const path = require('path');
        const sqlPath = path.join(process.cwd(), 'create-student-academic-history-table.sql');
        if (fs.existsSync(sqlPath)) {
          const sql = fs.readFileSync(sqlPath, 'utf8');
          console.log('student_academic_history not found — creating using', sqlPath);
          await dataSource.query(sql);
          console.log('student_academic_history table created');
        } else {
          console.warn('SQL file to create student_academic_history not found at', sqlPath);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to ensure student_academic_history table exists:', err.message || err);
  }

  // Global pipes, filters, and interceptors
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // API prefix
  app.setGlobalPrefix('api/v1');

  // CORS configuration: allow list via CORS_ORIGIN env (comma-separated)
  let corsEnv: string | undefined;
  let nodeEnv = 'development';
  try {
    corsEnv = configService.get('CORS_ORIGIN');
  } catch (e) {
    corsEnv = undefined;
  }
  try {
    nodeEnv = configService.get('NODE_ENV');
  } catch (e) {
    nodeEnv = process.env.NODE_ENV || 'development';
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
        // allow any localhost/127.0.0.1 origin regardless of port (covers various dev servers, including schomas-app)
        if (host === 'localhost' || host === '127.0.0.1') {
          return callback(null, true);
        }
        // in non-production, allow private LAN origins to ease phone testing over Wi-Fi
        if (nodeEnv !== 'production' && isPrivateIpv4Host(host)) {
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

  let port = 5000;
  let host = '0.0.0.0';
  try {
    port = Number.parseInt(configService.get('PORT'), 10) || 5000;
  } catch (e) {
    port = 5000;
  }
  try {
    host = configService.get('HOST') || '0.0.0.0';
  } catch (e) {
    host = '0.0.0.0';
  }

  await app.listen(port, host);

  const nets = networkInterfaces();
  const lanAddresses = Object.values(nets)
    .flat()
    .filter((addr): addr is NonNullable<typeof addr> => Boolean(addr))
    .filter((addr) => addr.family === 'IPv4' && !addr.internal)
    .map((addr) => addr.address);
  const uniqueLanAddresses = [...new Set(lanAddresses)];

  console.log(`API listening on http://localhost:${port}/api/v1`);
  uniqueLanAddresses.forEach((addr) => {
    console.log(`API listening on http://${addr}:${port}/api/v1`);
  });
}
bootstrap();
