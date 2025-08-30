import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

/**
 * Generate a unique username of the form:
 *   <firstTrunc><lastTrunc>[n]@YY
 * - firstTrunc: first 10 chars of normalized first name
 * - lastTrunc: first 10 chars of normalized last name
 * - collisions: append incrementing number before @YY starting at 2
 */
export async function generateUniqueUsername(
  firstName: string,
  lastName: string,
  userRepo: Repository<User>,
  provided?: string,
  suffix?: string // e.g. '@teacher', '@finance', '@parent'; if omitted defaults to @YY year tag
): Promise<string> {
  if (provided && provided.trim()) {
    const candidate = provided.trim().toLowerCase();
    const exists = await userRepo.findOne({ where: { username: candidate } });
    if (exists) throw new Error('Provided username already exists');
    return candidate;
  }

  const norm = (s: string) => (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['`’]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

  let f = norm(firstName).slice(0, 10);
  let l = norm(lastName).slice(0, 10);
  if (!f && !l) f = 'user';
  const base = (f + l) || 'user';
  const yearTag = '@' + new Date().getFullYear().toString().slice(-2);
  const roleTag = suffix && suffix.startsWith('@') ? suffix : suffix ? ('@' + suffix) : yearTag;

  let candidate = base + roleTag;
  if (!await userRepo.findOne({ where: { username: candidate } })) {
    return candidate;
  }

  let counter = 2;
  while (counter < 10000) {
  candidate = `${base}${counter}${roleTag}`;
    const exists = await userRepo.findOne({ where: { username: candidate } });
    if (!exists) return candidate;
    counter++;
  }

  // Fallback extremely unlikely path
  return base.slice(0, 12) + Date.now().toString(36) + roleTag;
}
