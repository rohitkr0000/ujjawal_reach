import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppContext } from '../context';
import { confirmImport, createPreview } from './importer';

/** The folder with the spreadsheets: works from source, from the bundle and from the repository root. */
function findDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env['DATA_DIR'] ?? '',
    resolve(here, '../../../../data'),
    resolve(here, '../../../data'),
    resolve(process.cwd(), 'data'),
    resolve(process.cwd(), '../../data'),
  ].filter(Boolean);
  return candidates.find((d) => existsSync(resolve(d, 'Delhi_Schemes.xlsx'))) ?? candidates[1]!;
}

const FILES: Array<{ file: string; state: string }> = [
  { file: 'Delhi_Schemes.xlsx', state: 'Delhi' },
  { file: 'MadhyaPradesh_Schemes.xlsx', state: 'Madhya Pradesh' },
];

/** Load the spreadsheets in /data through the normal import path (preview, then confirm). */
export async function seedFromFiles(ctx: AppContext, log: (m: string) => void = console.log): Promise<void> {
  for (const { file, state } of FILES) {
    const path = resolve(findDataDir(), file);
    if (!existsSync(path)) {
      log(`seed: ${file} not found, skipped`);
      continue;
    }
    const { summary } = await createPreview(ctx, { adminId: null, filename: file, buffer: readFileSync(path), state });
    if (summary.errors > 0) {
      log(`seed: ${file} has ${summary.errors} error row(s), not imported`);
      continue;
    }
    const r = await confirmImport(ctx, summary.id, null, 'cancel');
    log(`seed: ${file}: ${r.new} new, ${r.updated} updated`);
  }
}

export async function schemesTableIsEmpty(ctx: AppContext): Promise<boolean> {
  const { rows } = await ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM schemes');
  return rows[0]!.n === 0;
}
