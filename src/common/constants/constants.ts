import { ConfigService } from 'src/config/config.service';

const configService = new ConfigService();

export const JWT_CONSTANTS = {
    SECRET: configService.get('JWT_SECRET'),
    EXPIRES_IN: configService.get('JWT_EXPIRES_IN'),
  };
  
  export const DATABASE_CONSTANTS = {
    HOST: configService.get('DB_HOST'),
    PORT: configService.getNumber('DB_PORT'),
    USERNAME: configService.get('DB_USERNAME'),
    PASSWORD: configService.get('DB_PASSWORD'),
    DATABASE: configService.get('DB_DATABASE'),
  };
  
  export enum CacheTTL {
    ONE_MINUTE = 60,
    ONE_HOUR = 60 * 60,
    ONE_DAY = 60 * 60 * 24,
  }
  
  export const API_PREFIX = '/api/v1';