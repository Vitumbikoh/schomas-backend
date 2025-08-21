import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ConfigService } from '../config/config.service';
import { User } from '../user/entities/user.entity';
import { UserSettings } from '../settings/entities/user-settings.entity';

async function run() {
  const config = new ConfigService();
  const ds = new DataSource({
    type: 'postgres',
    host: config.get('DB_HOST') || 'localhost',
    port: parseInt(config.get('DB_PORT') || '5432'),
    username: config.get('DB_USERNAME') || 'postgres',
    password: config.get('DB_PASSWORD') || 'postgres',
    database: config.get('DB_DATABASE') || 'schomas',
    entities: [User, UserSettings],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  const userRepo = ds.getRepository(User);
  const settingsRepo = ds.getRepository(UserSettings);

  // 1. Find users whose settingsId points to nothing (orphan) OR is null
  const users = await userRepo.find({ relations: ['settings'] });

  let created = 0;
  let fixedNull = 0;

  for (const user of users) {
    if (!user.settings) {
      // Create settings row
      const settings = settingsRepo.create({
        notifications: { email: true, sms: false, browser: true, weeklySummary: true },
        security: { twoFactor: false },
      });
      await settingsRepo.save(settings);
      user.settings = settings as any;
      await userRepo.save(user);
      created++;
    } else if (!(user as any).settingsId) {
      // ensure FK set by resaving (some older rows may not have column populated)
      await userRepo.save(user);
      fixedNull++;
    }
  }
  console.log(`Backfill complete. Created settings: ${created}. Re-linked existing: ${fixedNull}.`);
  await ds.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
