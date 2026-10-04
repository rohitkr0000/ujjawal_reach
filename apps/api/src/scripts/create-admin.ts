/**
 * Create an admin account from the command line:
 *   npm run admin:create -w @ujjwal/api -- you@example.com "a long password 123" super_admin
 */
import { loadConfig } from '../config';
import { createPgDb, createPgliteDb, migrate } from '../db';
import { createAdmin } from '../services/admins';

async function main() {
  const [email, password, role = 'super_admin'] = process.argv.slice(2);
  if (!email || !password || !['super_admin', 'editor'].includes(role)) {
    console.error('Usage: create-admin <email> <password> [super_admin|editor]');
    process.exit(1);
  }
  const config = loadConfig();
  const db = config.DATABASE_URL ? await createPgDb(config.DATABASE_URL) : await createPgliteDb(config.PGLITE_DIR || '.data/pglite');
  await migrate(db);
  const a = await createAdmin(db, config, { email, password, role: role as 'super_admin' | 'editor' });
  console.log(`Created ${a.role} ${a.email}. They will set up two-step login on first sign in.`);
  await db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
