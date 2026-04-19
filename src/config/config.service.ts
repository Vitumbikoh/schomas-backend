import { Injectable } from '@nestjs/common';
import './env';

@Injectable()
export class ConfigService {
  get(key: string): string {
    const value = process.env[key];
    if (value === undefined) {
      throw new Error(`Missing env: ${key}`);
    }
    return value;
  }

  getOptional(key: string, defaultValue?: string): string | undefined {
    return process.env[key] ?? defaultValue;
  }

  getNumber(key: string): number {
    const value = Number.parseInt(this.get(key), 10);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid numeric env: ${key}`);
    }
    return value;
  }

  validateRequired(keys: string[]): void {
    keys.forEach((key) => this.get(key));
  }
}