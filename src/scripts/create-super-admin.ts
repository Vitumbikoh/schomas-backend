import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../database/data-source';
import { User } from '../user/entities/user.entity';
import { Role } from '../user/enums/role.enum';

async function main() {
  console.log('Initializing data source...');
  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(User);
    const email = 'matthews@superadmin.com';

    const existing = await repo.findOne({ where: { email } });
    if (existing) {
      console.log('Super admin already exists:', existing.id, existing.email);
      return;
    }

    const hashed = await bcrypt.hash('12345678', 10);

    // The User entity currently lacks a name field; using username & email.
    const user = repo.create({
      username: 'matthews.gondwe',
      email,
      password: hashed,
      role: Role.SUPER_ADMIN,
      isActive: true,
      schoolId: null,
    } as Partial<User>);

    const saved = await repo.save(user);
    console.log('✅ Created super admin:', saved.id, saved.email);
  } catch (err) {
    console.error('❌ Failed to create super admin:', err);
  } finally {
    await AppDataSource.destroy();
  }
}

main();
