import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';
import { UsersModule } from '../user/users.module';
import { School } from '../school/entities/school.entity';
import type { StringValue } from 'ms';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    TypeOrmModule.forFeature([School]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const expiresInRaw = configService.get('JWT_EXPIRES_IN');
        const parsedExpiresIn = Number(expiresInRaw);
        const expiresIn = Number.isNaN(parsedExpiresIn)
          ? (expiresInRaw as StringValue)
          : parsedExpiresIn;

        return {
          secret: configService.get('JWT_SECRET'),
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  providers: [
    AuthService, 
    LocalStrategy, 
    JwtStrategy, 
    JwtAuthGuard, 
    RolesGuard
  ],
  controllers: [AuthController],
  exports: [
    AuthService, 
    JwtModule,
    JwtAuthGuard, 
    RolesGuard,
    PassportModule, 
  ],
})
export class AuthModule {}