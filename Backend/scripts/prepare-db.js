/**
 * Runs before the server starts on a hosting platform (Render, Railway, a VPS…).
 *  1. checks that DATABASE_URL and the secrets are set (prints exactly what is missing)
 *  2. prisma/migrations exists → `prisma migrate deploy`, otherwise `prisma db push`
 *  3. SEED_DEMO_DATA=true → loads demo data once (the seed skips itself when data already exists)
 * Every failure is explained in plain words BEFORE the process exits, so the reason
 * appears in the host's log right above "Exited with status 1".
 * Plain JavaScript on purpose, so it runs without TypeScript tooling.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const isWin = process.platform === 'win32';

// Local runs: read Backend/.env if present (hosting platforms inject variables directly)
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  try {
    require('dotenv').config({ path: envFile });
  } catch {
    /* dotenv missing — ignore */
  }
}

function fail(title, lines) {
  console.error(`\n❌ ${title}`);
  for (const l of lines) console.error(`   ${l}`);
  console.error('');
  process.exit(1);
}

// ---------- 1. settings ----------
const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_SECRET'];
const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
if (missing.length) {
  fail(`Missing environment variable(s): ${missing.join(', ')}`, [
    'Render: open your WEB SERVICE → Environment → Add Environment Variable, add them, then Save Changes.',
    'DATABASE_URL = the "Internal Database URL" from your Render PostgreSQL page (Connections section).',
    'JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / ENCRYPTION_SECRET = any long random text (8+ characters).',
  ]);
}

let dbInfo = '';
try {
  const u = new URL(process.env.DATABASE_URL);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('not postgres');
  dbInfo = `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  console.log(`✔ DATABASE_URL is set → ${dbInfo}`);
} catch {
  fail('DATABASE_URL is not a valid PostgreSQL address', [
    'It must look like: postgresql://USER:PASSWORD@HOST:5432/DATABASE',
    'Copy it again from Render → your PostgreSQL → Connections → Internal Database URL.',
    'Special characters in the password must be encoded (@ → %40, # → %23).',
  ]);
}

// ---------- 2. tables ----------
function prisma(args) {
  console.log(`\n> prisma ${args}`);
  const r = spawnSync(isWin ? 'npx.cmd' : 'npx', ['prisma', ...args.split(' ')], { cwd: root, encoding: 'utf8', env: process.env, shell: isWin });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out);
  return { ok: r.status === 0, out };
}

function explain(out) {
  if (/P1012|Environment variable not found: DATABASE_URL/.test(out)) return ['DATABASE_URL is not visible to Prisma.', 'Add it under your web service → Environment (not on the database page), then redeploy.'];
  if (/P1000|Authentication failed|password authentication failed/i.test(out)) return [`The database user/password in DATABASE_URL is wrong (${dbInfo}).`, 'Copy the Internal Database URL again from Render → PostgreSQL → Connections.'];
  if (/P1001|Can't reach database server/i.test(out)) return [`Cannot reach the database at ${dbInfo}.`, 'Use the INTERNAL Database URL, and make sure the database and the web service are in the SAME region.', 'If the database was just created, wait until its status is "Available".'];
  if (/P1003|does not exist/i.test(out)) return [`The database name in DATABASE_URL does not exist (${dbInfo}).`, 'Use the exact Internal Database URL shown by Render.'];
  if (/P3009/.test(out)) return ['A previous migration failed and is marked as failed in the database.', 'Easiest for a fresh deploy: delete and recreate the Render database, or run: npx prisma migrate resolve --rolled-back <migration_name>'];
  if (/P1017|Server has closed the connection|SSL/i.test(out)) return ['The database closed the connection (often SSL).', 'Add ?sslmode=require to the end of DATABASE_URL (or &sslmode=require if it already has a ?).'];
  return ['See the Prisma message above.'];
}

const migrationsDir = path.join(root, 'prisma', 'migrations');
const hasMigrations =
  fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).some((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory());

let r = hasMigrations ? prisma('migrate deploy') : prisma('db push --skip-generate');
if (!r.ok && hasMigrations && /P3005/.test(r.out)) {
  // Tables already exist without migration history (created earlier with db push / SQL script) → sync them instead
  console.log('\nℹ️  The database already has tables but no migration history (P3005). Syncing with `prisma db push` instead.');
  r = prisma('db push --skip-generate');
}
if (!r.ok) fail('Could not create / update the database tables', explain(r.out));
console.log('✔ Database tables are ready');

// ---------- 3. demo data ----------
if (process.env.SEED_DEMO_DATA === 'true') {
  console.log('\n> seeding demo data (SEED_DEMO_DATA=true)');
  const s = spawnSync(isWin ? 'npx.cmd' : 'npx', ['tsx', 'prisma/seed.ts'], { cwd: root, stdio: 'inherit', env: process.env, shell: isWin });
  if (s.status !== 0) fail('Seeding demo data failed', ['See the message above. The server will not start until this is fixed, or set SEED_DEMO_DATA=false.']);
}
