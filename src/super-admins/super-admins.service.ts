import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../user/user.service';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { Role } from '../user/enums/role.enum';

@Injectable()
export class SuperAdminsService {
  constructor(private readonly usersService: UsersService) {}

  async create(dto: CreateSuperAdminDto) {
    // Enforce uniqueness by email via UsersService findByEmail
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    return this.usersService.createUser({
      username: dto.username,
      email: dto.email,
      password: dto.password,
      role: Role.SUPER_ADMIN,
    });
  }

  async bootstrapFirst(dto: CreateSuperAdminDto) {
    const count = await this.usersService.countSuperAdmins();
    if (count > 0) {
      throw new ForbiddenException('Bootstrap disabled: super admin already exists');
    }
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) throw new ConflictException('Email already in use');
    return this.create(dto);
  }
}
