import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, salt, expected] = storedHash.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived);
}
