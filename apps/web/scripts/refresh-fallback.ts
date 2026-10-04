/**
 * Copies the published scheme files of every state from the live API into
 * public/data/schemes-<state>.json. The website shows these if the API cannot be reached, so
 * run this before each website build:
 *
 *   NEXT_PUBLIC_API_URL=https://api.example.in npm run data:refresh -w @ujjwal/web
 *
 * A state the API cannot deliver keeps its existing file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES, STATE_META } from '@ujjwal/schemes';

const api = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
if (!api) {
  console.log('NEXT_PUBLIC_API_URL is not set: keeping the existing fallback files.');
  process.exit(0);
}
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data');
mkdirSync(dir, { recursive: true });

let failed = 0;
for (const state of STATES) {
  const slug = STATE_META[state].slug;
  try {
    const res = await fetch(`${api}/public/schemes/${slug}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = (await res.json()) as { schemes: unknown[] };
    if (!Array.isArray(file.schemes)) throw new Error('not a scheme file');
    writeFileSync(resolve(dir, `schemes-${slug}.json`), JSON.stringify(file));
    console.log(`${state}: ${file.schemes.length} schemes written`);
  } catch (e) {
    failed++;
    console.error(`${state}: kept the existing file (${e instanceof Error ? e.message : e})`);
  }
}
process.exit(failed === STATES.length ? 1 : 0);
