/**
 * Runs before the server starts on a hosting platform (Render, Railway, a VPS…).
 *  - prisma/migrations exists → `prisma migrate deploy` (recommended once you commit migrations)
 *  - no migrations yet        → `prisma db push` (creates / updates the tables from schema.prisma)
 *  - SEED_DEMO_DATA=true      → loads demo data once (the seed skips itself when data already exists)
 * Plain JavaScript on purpose, so it runs without TypeScript tooling.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
};

const migrationsDir = path.join(root, 'prisma', 'migrations');
const hasMigrations =
  fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).some((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory());

run(hasMigrations ? 'npx prisma migrate deploy' : 'npx prisma db push --skip-generate');

if (process.env.SEED_DEMO_DATA === 'true') run('npx tsx prisma/seed.ts');
