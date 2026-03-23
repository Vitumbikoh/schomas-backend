import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HostelController } from './hostel.controller';
import { HostelService } from './hostel.service';
import { Hostel } from './entities/hostel.entity';
import { HostelRoom } from './entities/hostel-room.entity';
import { HostelAllocation } from './entities/hostel-allocation.entity';
import { HostelSetup } from './entities/hostel-setup.entity';
import { Student } from '../user/entities/student.entity';
import { Class } from '../classes/entity/class.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../user/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Hostel, HostelRoom, HostelAllocation, HostelSetup, Student, Class]),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [HostelController],
  providers: [HostelService],
  exports: [HostelService],
})
export class HostelModule {}
