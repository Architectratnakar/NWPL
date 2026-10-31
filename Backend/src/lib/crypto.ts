import crypto from 'crypto';
import { env } from '../config/env';

const key = crypto.createHash('sha256').update(env.ENCRYPTION_SECRET).digest();

/** AES-256-GCM. Output: base64(iv | tag | ciphertext) */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export const mask = (v: string, visible = 4) => (v.length <= visible ? v : '•'.repeat(Math.max(4, v.length - visible)) + v.slice(-visible));
export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
export const randomToken = () => crypto.randomBytes(48).toString('base64url');
