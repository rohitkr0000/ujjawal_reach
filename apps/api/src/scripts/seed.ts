/** Load the Delhi and Madhya Pradesh spreadsheets from /data:  npm run seed -w @ujjwal/api */
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { createPgDb, createPgliteDb, migrate } from '../db';
import { seedFromFiles } from '../services/seed';

async function main() {
  const config = loadConfig();
  const db = config.DATABASE_URL ? await createPgDb(config.DATABASE_URL) : await createPgliteDb(config.PGLITE_DIR || '.data/pglite');
  await migrate(db);
  const { ctx, app } = await buildApp({ db, config });
  await seedFromFiles(ctx);
  await app.close();
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
