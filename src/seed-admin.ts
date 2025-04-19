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
    const adminExists = await userRepository.findOneBy({ username: 'admin' });
    if (adminExists) {
      console.log('Admin user already exists');
      return;
    }

    // Create admin
    const admin = userRepository.create({
      username: 'admin',
      email: 'admin@school.com',
      password: await bcrypt.hash('admin123', 10),
      role: Role.ADMIN,
      isActive: true
    });

    await userRepository.save(admin);
    console.log('✅ Admin user created successfully');
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
  } finally {
    // Close connection
    await AppDataSource.destroy();
  }
}

seedAdmin();