import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  private readonly envConfig: Record<string, string>;

  constructor() {
    // Try to load from .env file first
    const envFile = process.env.NODE_ENV === 'production' 
      ? '.env.production' 
      : '.env.development';

    let fileConfig: Record<string, string> = {};
    try {
      fileConfig = dotenv.parse(fs.readFileSync(envFile));
    } catch (err) {
      console.warn(`Failed to load ${envFile}, falling back to process.env values.`);
    }

    // Allow runtime environment variables to override file values.
    const processConfig = Object.fromEntries(
      Object.entries(process.env).filter(([_, value]) => value !== undefined) as [string, string][],
    );

    this.envConfig = {
      ...fileConfig,
      ...processConfig,
    };
  }

  get(key: string): string {
    const value = this.envConfig[key];
    if (value === undefined) {
      throw new Error(`Configuration error: Missing required environment variable ${key}`);
    }
    return value;
  }
}