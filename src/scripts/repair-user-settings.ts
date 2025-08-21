import 'reflect-metadata';
import { Client } from 'pg';

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'schomas',
  });
  await client.connect();
  console.log('Connected to DB, starting user_settings repair...');
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "user_settings" (
      id uuid PRIMARY KEY,
      notifications jsonb DEFAULT '{"email":true,"sms":false,"browser":true,"weeklySummary":true}',
      security jsonb DEFAULT '{"twoFactor":false}'
    )`);

    const orphanInsert = await client.query(`INSERT INTO user_settings (id)
      SELECT DISTINCT u."settingsId" FROM "user" u
      LEFT JOIN user_settings s ON s.id = u."settingsId"
      WHERE u."settingsId" IS NOT NULL AND s.id IS NULL`);
    console.log(`Created ${orphanInsert.rowCount} orphan user_settings rows.`);

    const usersNoSettings = await client.query(`SELECT id FROM "user" WHERE "settingsId" IS NULL`);
    let createdForNull = 0;
    for (const row of usersNoSettings.rows) {
      const res = await client.query(`INSERT INTO user_settings (id) VALUES (gen_random_uuid()) RETURNING id`);
      const newId = res.rows[0].id;
      await client.query(`UPDATE "user" SET "settingsId" = $1 WHERE id = $2`, [newId, row.id]);
      createdForNull++;
    }
    console.log(`Created and linked ${createdForNull} settings rows for users that had NULL.`);

    try {
      await client.query(`ALTER TABLE "user" ADD CONSTRAINT "FK_390395c3d8592e3e8d8422ce853" FOREIGN KEY ("settingsId") REFERENCES "user_settings"(id) ON DELETE SET NULL ON UPDATE NO ACTION`);
      console.log('Foreign key added.');
    } catch (e:any) {
      if (e && e.code === '42710') {
        console.log('Foreign key already exists, skipping.');
      } else if (e && e.code === '23503') {
        console.error('Still orphan references exist; re-run the script. Detail:', e.detail);
      } else {
        console.log('FK add attempt message:', e.message);
      }
    }
  } finally {
    await client.end();
    console.log('Repair script finished.');
  }
}

run().catch(e => { console.error(e); process.exit(1); });
