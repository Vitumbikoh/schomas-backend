export const JWT_CONSTANTS = {
    SECRET: process.env.JWT_SECRET || 'school-management-secret-key',
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '60m',
  };
  
  export const DATABASE_CONSTANTS = {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: parseInt(process.env.DB_PORT || '5432', 10),
    USERNAME: process.env.DB_USERNAME || 'postgres',
    PASSWORD: process.env.DB_PASSWORD || 'g1Bird fly',
    DATABASE: process.env.DB_DATABASE || 'schomas',
  };
  
  export enum CacheTTL {
    ONE_MINUTE = 60,
    ONE_HOUR = 60 * 60,
    ONE_DAY = 60 * 60 * 24,
  }
  
  export const API_PREFIX = '/api/v1';