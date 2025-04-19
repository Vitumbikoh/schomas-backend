import { DataSource } from 'typeorm';
import { ConfigService } from '../config/config.service';

export const databaseProviders = [
  {
    provide: 'DATA_SOURCE',
    useFactory: async (configService: ConfigService) => {
      const dataSource = new DataSource({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: parseInt(configService.get('DB_PORT')),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        // synchronize: configService.get('NODE_ENV') !== 'production',
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'development',
      });

      return dataSource.initialize();
    },
    inject: [ConfigService], // Explicitly inject ConfigService
  },
];