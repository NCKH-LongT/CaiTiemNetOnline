import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [, salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, expected);
}

export function cookie(request, name) {
  const item = (request.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : null;
}

export function setCookie(response, name, token, maxAge) {
  const parts = [`${name}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`];
  if (process.env.COOKIE_SECURE === 'true') parts.push('Secure');
  response.setHeader('Set-Cookie', parts.join('; '));
}
