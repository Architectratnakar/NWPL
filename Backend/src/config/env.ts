import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Loads Backend/.env reliably on every OS:
 *  - always from the Backend folder (not from wherever the command was started)
 *  - repairs files saved as UTF-16 by Windows PowerShell / Notepad (rewrites them as UTF-8)
 *  - removes a UTF-8 BOM
 *  - prints a clear diagnosis when something is missing
 */
const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(BACKEND_DIR, '.env');

function readEnvFile(): { found: boolean; note?: string } {
  if (!fs.existsSync(ENV_FILE)) {
    const txt = ENV_FILE + '.txt';
    if (fs.existsSync(txt)) return { found: false, note: `Found "${txt}". Rename it to ".env" (Windows added .txt).` };
    return { found: false, note: `No file at ${ENV_FILE}` };
  }
  let buf = fs.readFileSync(ENV_FILE);
  let note: string | undefined;
  const utf16le = (buf[0] === 0xff && buf[1] === 0xfe) || (buf.length > 3 && buf[1] === 0x00 && buf[3] === 0x00);
  const utf16be = buf[0] === 0xfe && buf[1] === 0xff;
  if (utf16le || utf16be) {
    let text = utf16be ? Buffer.from(buf).swap16().toString('utf16le') : buf.toString('utf16le');
    text = text.replace(/^﻿/, '');
    fs.writeFileSync(ENV_FILE, text, 'utf8'); // repair so Prisma CLI can read it too
    buf = Buffer.from(text, 'utf8');
    note = '.env was saved as UTF-16 (PowerShell/Notepad). It has been converted to UTF-8 automatically.';
  }
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const parsed = dotenv.parse(text);
  for (const [k, v] of Object.entries(parsed)) if (process.env[k] === undefined) process.env[k] = v;
  return { found: true, note };
}

const loaded = readEnvFile();
if (loaded.note) console.warn(`⚠️  ${loaded.note}`);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // one or more allowed Frontend origins, comma-separated
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  ACCESS_TOKEN_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(7),
  ENCRYPTION_SECRET: z.string().min(8),
  UPLOAD_DIR: z.string().default('uploads'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  DEMO_PAYMENTS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n❌ Backend settings are missing or invalid.');
  console.error(`   Looked for: ${ENV_FILE}  →  ${loaded.found ? 'file found' : 'FILE NOT FOUND'}`);
  if (loaded.found) {
    const keys = Object.keys(dotenv.parse(fs.readFileSync(ENV_FILE, 'utf8').replace(/^﻿/, '')));
    console.error(`   Keys read from the file: ${keys.length ? keys.join(', ') : '(none — the file is empty or not saved)'}`);
  }
  console.error('   Problems:', parsed.error.flatten().fieldErrors);
  console.error('   Fix: copy Backend/.env.example to Backend/.env, set DATABASE_URL, save the file, run again.\n');
  process.exit(1);
}
export const env = parsed.data;
