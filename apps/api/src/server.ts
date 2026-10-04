import { resolve } from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createPgDb, createPgliteDb, migrate, type Db } from './db';
import { createAdmin } from './services/admins';
import { startJobs } from './services/jobs';
import { schemesTableIsEmpty, seedFromFiles } from './services/seed';

async function main() {
  const config = loadConfig();
  let db: Db;
  if (config.DATABASE_URL) {
    db = await createPgDb(config.DATABASE_URL);
  } else {
    const dir = config.PGLITE_DIR || resolve(process.cwd(), '.data/pglite');
    console.warn(`DATABASE_URL is not set: using the built-in development database in ${dir}`);
    db = await createPgliteDb(dir);
  }
  const applied = await migrate(db);
  if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

  const { app, ctx } = await buildApp({ db, config, logger: true });

  // First start: create the first super admin from the environment, if there is none yet.
  if (config.BOOTSTRAP_ADMIN_EMAIL && config.BOOTSTRAP_ADMIN_PASSWORD) {
    const n = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM admins')).rows[0]!.n;
    if (n === 0) {
      await createAdmin(db, config, { email: config.BOOTSTRAP_ADMIN_EMAIL, password: config.BOOTSTRAP_ADMIN_PASSWORD, role: 'super_admin' });
      app.log.info(`Created the first super admin ${config.BOOTSTRAP_ADMIN_EMAIL}. Remove BOOTSTRAP_ADMIN_* from the environment now.`);
    }
  }
  // Development convenience: load the spreadsheets from /data into an empty database.
  if (!config.isProd && (await schemesTableIsEmpty(ctx))) await seedFromFiles(ctx, (m) => app.log.info(m));

  await app.listen({ port: config.PORT, host: config.HOST });
  const stopJobs = startJobs(ctx, (m) => app.log.info(m));

  const stop = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    stopJobs();
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
