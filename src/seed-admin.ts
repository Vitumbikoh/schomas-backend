// src/seed-admin.ts
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './database/data-source';
import { User } from './user/entities/user.entity';
import { Role } from './user/enums/role.enum';

async function seedAdmin() {
  try {
    // Initialize connection
    await AppDataSource.initialize();
    console.log('Database connection established');

    const userRepository = AppDataSource.getRepository(User);

    // Check if admin exists
    const adminExists = await userRepository.findOneBy({ username: 'superadmin' });
    if (adminExists) {
      console.log('Super admin user already exists');
      return;
    }

    // Create admin
    const admin = userRepository.create({
      username: 'superadmin',
      email: 'superadmin@platform.com',
      password: await bcrypt.hash('superadmin123', 10),
      role: Role.SUPER_ADMIN,
      isActive: true,
      schoolId: null,
    });

    await userRepository.save(admin);
  console.log('✅ Super Admin user created successfully');
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
  } finally {
    // Close connection
    await AppDataSource.destroy();
  }
}

seedAdmin();