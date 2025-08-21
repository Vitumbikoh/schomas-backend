import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ConfigService } from 'src/config/config.service';
import { User } from 'src/user/entities/user.entity';
import { UserSettings } from 'src/settings/entities/user-settings.entity';

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
  // Null orphan references first
  await ds.query(`UPDATE "user" u SET "settingsId" = NULL WHERE "settingsId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "user_settings" s WHERE s.id = u."settingsId")`);
  const userRepo = ds.getRepository(User);
  const settingsRepo = ds.getRepository(UserSettings);
  const users = await userRepo.find({ relations: ['settings'] });
  let created = 0;
  for (const user of users) {
    if (!user.settings) {
      const defaults = settingsRepo.create({
        notifications: { email: true, sms: false, browser: true, weeklySummary: true },
        security: { twoFactor: false },
      });
      await settingsRepo.save(defaults);
      user.settings = defaults as any;
      await userRepo.save(user);
      created++;
    }
  }
  console.log(`Orphan cleanup done. New settings created: ${created}`);
  await ds.destroy();
}

run().catch(e => { console.error(e); process.exit(1); });
