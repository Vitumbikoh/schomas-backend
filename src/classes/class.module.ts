// class.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassController } from './class.controller';
import { ClassService } from './class.service';
import { Class } from './entity/class.entity';
import { AuthModule } from '../auth/auth.module'; // Add this import
import { ConfigModule } from 'src/config/config.module';
import { LogsModule } from 'src/logs/logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Class]),
    AuthModule, 
    ConfigModule,
    LogsModule
  ],
  providers: [ClassService],
  controllers: [ClassController],
  exports: [TypeOrmModule.forFeature([Class]), ClassService], 
})
export class ClassModule {}