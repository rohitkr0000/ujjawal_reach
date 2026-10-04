/**
 * Quarterly job: check that every official link of the active schemes still works.
 *
 *   DATABASE_URL=postgres://... npm run links:check -w @ujjwal/api -- [--state "Delhi"] [--out links-report.csv]
 *
 * Writes a CSV with one row per scheme (ok, moved, blocked, broken) and exits with code 1 if any
 * link is broken or moved. "Blocked" means the site refuses automatic checks (common for
 * government sites): open those by hand.
 */
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../config';
import { createPgDb, createPgliteDb } from '../db';
import { toCsv } from '../lib/csv';
import { checkLinks } from '../services/links';

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const state = arg('--state');
  const out = arg('--out') ?? `links-report-${new Date().toISOString().slice(0, 10)}.csv`;

  const config = loadConfig();
  const db = config.DATABASE_URL ? await createPgDb(config.DATABASE_URL) : await createPgliteDb(config.PGLITE_DIR || '.data/pglite');
  const { rows } = await db.query<{ id: string; name: string; state: string; url: string }>(
    `SELECT id, name, state, url FROM schemes WHERE status = 'active' ${state ? 'AND state = $1' : ''} ORDER BY state, id`,
    state ? [state] : [],
  );
  await db.close();

  console.log(`Checking ${rows.length} links...`);
  const results = await checkLinks(rows, {
    concurrency: 8,
    onProgress: (d, t) => d % 10 === 0 && console.log(`  ${d}/${t}`),
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = results.map((r) => [r.id, byId.get(r.id)!.state, byId.get(r.id)!.name, r.status, r.httpStatus ?? '', r.url, r.finalUrl ?? '', r.note]);
  writeFileSync(out, toCsv(['Scheme_ID', 'State', 'Scheme', 'Result', 'HTTP status', 'Link', 'Final address', 'Note'], lines));

  const count = (s: string) => results.filter((r) => r.status === s).length;
  console.log(`ok ${count('ok')}, moved ${count('moved')}, blocked ${count('blocked')}, broken ${count('broken')}. Report: ${out}`);
  process.exit(count('broken') + count('moved') > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
