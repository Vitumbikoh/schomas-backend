import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradeFormat } from './entity/grade-format.entity';
import { GradeFormatService } from './grade-format.service';
import { GradeFormatController } from './grade-format.controller';
import { GradeFormatLegacyController } from './grade-format.legacy.controller';
import { User } from 'src/user/entities/user.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GradeFormat, User]),
    AuthModule,
    ConfigModule,
  ],
  providers: [GradeFormatService],
  controllers: [GradeFormatController, GradeFormatLegacyController],
  exports: [GradeFormatService],
})
export class GradeFormatModule {}
