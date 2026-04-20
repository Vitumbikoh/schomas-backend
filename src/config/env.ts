import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Force NODE_ENV to be stable in PM2 or server environments
const nodeEnv = process.env.NODE_ENV?.trim() || 'production';

// Resolve paths relative to project root (not process cwd issues)
const envFiles = [
  path.resolve(process.cwd(), `.env.${nodeEnv}`),
  path.resolve(process.cwd(), `.env`),
];

// Find the first existing env file
const envFile = envFiles.find((file) => fs.existsSync(file));

if (!envFile) {
  throw new Error(
    `No environment file found. Expected one of: ${envFiles.join(', ')}`
  );
}

// Load selected environment file
dotenv.config({ path: envFile });

// Debug (safe for production logs if needed)
console.log(`[ENV] Loaded file: ${envFile}`);
console.log(`[ENV] NODE_ENV: ${nodeEnv}`);