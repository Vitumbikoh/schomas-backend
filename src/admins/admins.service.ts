import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/user/user.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { Role } from 'src/user/enums/role.enum';

@Injectable()
export class AdminsService {
  constructor(private readonly usersService: UsersService) {}

  async create(createAdminDto: CreateAdminDto) {
    return this.usersService.createUser({
      ...createAdminDto,
      role: Role.ADMIN,
    });
  }
}
