import { createApp } from './app';
import { env } from './config/env';
import { propagatePending } from './engine/bv';
import { checkDatabase } from './lib/dbcheck';

async function main() {
  const db = await checkDatabase();
  console.log(db.ok ? `✅ Database: ${db.status}` : `\n❌ Database problem: ${db.status}`);
  if (db.fix) console.log(`   ${db.ok ? '👉' : 'Fix:'} ${db.fix}\n`);
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`✅ API running on http://localhost:${env.PORT}`);
    console.log(`📘 Swagger docs   http://localhost:${env.PORT}/api/docs`);
  });

  // Lightweight background worker: push pending BV up the tree every 30 s.
  // (In production run this in a separate worker process / job queue.)
  let dbReady = db.ok;
  setInterval(async () => {
    if (!dbReady) {
      dbReady = (await checkDatabase()).ok; // wait quietly until the tables exist
      if (!dbReady) return;
      console.log('✅ Database is ready now.');
    }
    propagatePending().catch((e) => console.error('BV propagation failed', e));
  }, 30_000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
