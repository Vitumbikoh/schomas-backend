import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const nodeEnv = process.env.NODE_ENV || 'development';
const preferredEnvFile = path.resolve(process.cwd(), `.env.${nodeEnv}`);
const fallbackEnvFile = path.resolve(process.cwd(), '.env');

if (fs.existsSync(preferredEnvFile)) {
  dotenv.config({ path: preferredEnvFile });
} else {
  dotenv.config({ path: fallbackEnvFile });
}
