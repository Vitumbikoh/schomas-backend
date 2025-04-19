import { DataSource } from 'typeorm';
import { ConfigService } from '../config/config.service';

// Create config service instance
const configService = new ConfigService();

export default new DataSource({
  type: 'postgres',
  host: configService.get('DB_HOST'),
  port: parseInt(configService.get('DB_PORT')),
  username: configService.get('DB_USERNAME'),
  password: configService.get('DB_PASSWORD'),
  database: configService.get('DB_DATABASE'),
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: configService.get('NODE_ENV') !== 'production',
  // synchronize: false,
  logging: configService.get('NODE_ENV') === 'development',
});