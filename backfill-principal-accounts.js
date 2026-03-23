const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'g1Bird fly',
  database: process.env.DB_DATABASE || 'edunexus',
};

const DEFAULT_PASSWORD = '12345678';

function sanitizeWord(value, fallback) {
  const clean = String(value || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return clean || fallback;
}

function sanitizeCode(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'school';
}

async function usernameExists(client, username) {
  const result = await client.query('SELECT 1 FROM "user" WHERE username = $1 LIMIT 1', [username]);
  return result.rowCount > 0;
}

async function emailExists(client, email) {
  const result = await client.query('SELECT 1 FROM "user" WHERE email = $1 LIMIT 1', [email]);
  return result.rowCount > 0;
}

async function uniqueUsername(client, base) {
  let candidate = base;
  let counter = 1;
  while (await usernameExists(client, candidate)) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  return candidate;
}

async function uniqueEmail(client, baseLocalPart, domain) {
  let candidate = `${baseLocalPart}@${domain}.com`;
  let counter = 1;
  while (await emailExists(client, candidate)) {
    candidate = `${baseLocalPart}${counter}@${domain}.com`;
    counter += 1;
  }
  return candidate;
}

async function ensurePrincipalRoleEnum(client) {
  try {
    const enumCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role_enum'
          AND e.enumlabel = 'PRINCIPAL'
      ) AS exists
    `);

    if (!enumCheck.rows[0]?.exists) {
      await client.query('ALTER TYPE "user_role_enum" ADD VALUE \'PRINCIPAL\'');
      console.log('Added PRINCIPAL to user_role_enum');
    }
  } catch (error) {
    console.warn('Could not verify/alter enum user_role_enum. Continuing:', error.message);
  }
}

async function backfillPrincipalAccounts() {
  const client = new Client(dbConfig);

  try {
    await client.connect();
    console.log('Connected to database');
    await ensurePrincipalRoleEnum(client);

    const schoolsResult = await client.query(`
      SELECT s.id, s.name, s.code
      FROM schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM "user" u
        WHERE u."schoolId" = s.id
          AND u.role = 'PRINCIPAL'
      )
      ORDER BY s."createdAt" ASC
    `);

    const schools = schoolsResult.rows;
    if (schools.length === 0) {
      console.log('No schools require principal backfill.');
      return;
    }

    console.log(`Found ${schools.length} school(s) without a principal account.`);

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    for (const school of schools) {
      const cleanCode = sanitizeCode(school.code);

      const username = await uniqueUsername(client, `${cleanCode}principal`);
      const email = await uniqueEmail(client, 'principal', cleanCode);

      await client.query(
        `
          INSERT INTO "user" (
            id,
            username,
            email,
            password,
            role,
            "schoolId",
            "isActive",
            "forcePasswordReset",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'PRINCIPAL',
            $5,
            true,
            true,
            NOW(),
            NOW()
          )
        `,
        [randomUUID(), username, email, hashedPassword, school.id],
      );
      console.log(`Created principal for ${school.name} (${school.code}) -> ${username} / ${email}`);
    }

    console.log('Principal backfill completed successfully.');
    console.log(`Default password for created principals: ${DEFAULT_PASSWORD}`);
  } catch (error) {
    console.error('Failed to backfill principal accounts:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

backfillPrincipalAccounts();
