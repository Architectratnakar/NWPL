const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendDir = path.resolve(__dirname, '..');
const distServer = path.join(backendDir, 'dist', 'server.js');

if (!fs.existsSync(distServer)) {
  console.error('❌ Production server bundle not found: dist/server.js');
  console.error('   Run this first in Backend: npm run build');
  process.exit(1);
}

const envFile = path.join(backendDir, '.env');
if (!fs.existsSync(envFile)) {
  console.error('❌ Missing Backend/.env');
  console.error('   Copy Backend/.env.example to Backend/.env and set DATABASE_URL.');
  process.exit(1);
}

console.log('🔧 Preparing database for production start...');
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  console.error('\n❌ Prisma migration failed. Fix the database setup and try again.');
  process.exit(result.status ?? 1);
}

console.log('\n✅ Database is ready. Starting API...');
