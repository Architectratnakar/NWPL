/**
 * Database connection check:   npm run db:check
 * Tests the DATABASE_URL in Backend/.env directly against PostgreSQL and explains the result.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

const envFile = path.resolve(__dirname, '..', '.env');
console.log(`\n1) Settings file: ${envFile}`);
if (!fs.existsSync(envFile)) {
  console.log('   ❌ Not found. Copy .env.example to .env in this folder.');
  process.exit(1);
}
const raw = fs.readFileSync(envFile);
const text = (raw[1] === 0 ? raw.toString('utf16le') : raw.toString('utf8')).replace(/^﻿/, '');
const url = dotenv.parse(text).DATABASE_URL;
if (!url) {
  console.log('   ❌ DATABASE_URL line is missing in .env');
  process.exit(1);
}

let u: URL;
try {
  u = new URL(url);
} catch {
  console.log('   ❌ DATABASE_URL is not a valid address. A special character in the password must be encoded (@ → %40, # → %23).');
  process.exit(1);
}
const password = decodeURIComponent(u.password);
console.log(`   user     : ${u.username}`);
console.log(`   password : ${password ? `${password[0]}${'*'.repeat(Math.max(0, password.length - 2))}${password.length > 1 ? password.at(-1) : ''}  (${password.length} characters)` : '(empty)'}`);
console.log(`   server   : ${u.hostname}:${u.port || 5432}`);
console.log(`   database : ${u.pathname.slice(1) || '(none)'}`);
if (['postgres', 'password', 'YOUR_PASSWORD', 'YOUR_REAL_PASSWORD'].includes(password)) {
  console.log('   ⚠️  This looks like the EXAMPLE password from .env.example, not your real PostgreSQL password.');
}

async function tryConnect(database: string) {
  const c = new Client({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password, database, connectionTimeoutMillis: 5000 });
  try {
    await c.connect();
    return { ok: true as const, client: c };
  } catch (e) {
    return { ok: false as const, error: e as Error & { code?: string } };
  }
}

(async () => {
  console.log('\n2) Logging in to PostgreSQL with these details…');
  const db = u.pathname.slice(1) || 'postgres';
  const r = await tryConnect('postgres');
  if (!r.ok) {
    const code = r.error.code;
    if (code === '28P01') {
      console.log('   ❌ WRONG PASSWORD. PostgreSQL rejected this password for user "' + u.username + '".');
      console.log('      → Use the password you set when installing PostgreSQL (the one pgAdmin accepts),');
      console.log('        or set a new one (see "How to set a new password" in the README), then edit DATABASE_URL.');
    } else if (code === 'ECONNREFUSED' || /ECONNREFUSED|timeout/i.test(r.error.message)) {
      console.log(`   ❌ PostgreSQL is not running on ${u.hostname}:${u.port || 5432}.`);
      console.log('      → Windows: press Win+R → services.msc → postgresql-x64-NN → Start. Check the port in pgAdmin (Server → Properties → Connection).');
    } else {
      console.log(`   ❌ ${code ?? ''} ${r.error.message}`);
    }
    process.exit(1);
  }
  console.log('   ✅ Password is correct — connected to PostgreSQL.');
  const exists = await r.client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
  await r.client.end();
  if (!exists.rowCount) {
    console.log(`\n3) ❌ Database "${db}" does not exist yet. Create it:  in pgAdmin → Databases → Create → Database → "${db}"`);
    process.exit(1);
  }
  console.log(`\n3) ✅ Database "${db}" exists.`);
  const r2 = await tryConnect(db);
  if (!r2.ok) { console.log('   ❌', r2.error.message); process.exit(1); }
  const t = await r2.client.query(`SELECT to_regclass('public."User"') IS NOT NULL AS ok`);
  if (!t.rows[0].ok) {
    await r2.client.end();
    console.log('\n4) ❌ Tables are not created yet.  Run:  npx prisma migrate dev --name init   then   npm run db:seed');
    process.exit(1);
  }
  const n = await r2.client.query('SELECT COUNT(*)::int AS n FROM "User"');
  await r2.client.end();
  console.log(`\n4) ✅ Tables exist — ${n.rows[0].n} logins in the database.`);
  console.log(n.rows[0].n ? '\n🎉 Everything is OK. Restart the Backend (Ctrl+C, then npm run dev) and log in with admin@navarth.demo / Admin@123\n' : '\n👉 Run:  npm run db:seed   to create the demo logins.\n');
})();
