/**
 * Builds the data files from the source spreadsheets:
 *   data/Scheme_Template.xlsx            blank template (same file the admin panel downloads)
 *   data/Delhi_Schemes.xlsx              the 83 Delhi schemes in the final template format
 *   data/MadhyaPradesh_Schemes.xlsx      the 15 prototype MP schemes in the template format
 *   data/import-report.md                what was mapped, warnings and anything needing review
 *   apps/web/public/data/schemes-*.json  public scheme files (the website's offline fallback)
 *
 * Run with: npm run data:build
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchemesWorkbook, parseLegacyWorkbook } from '../src/excel';
import { STATE_SLUGS, toPublicSchemes, validateRow } from '../src';
import type { RawRow, Scheme } from '../src';
import { MP_PROTOTYPE_ROWS } from './mp-prototype';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = resolve(root, 'data');
const publicDir = resolve(root, 'apps/web/public/data');
mkdirSync(dataDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const report: string[] = ['# Data build report', '', `Generated: ${new Date().toISOString()}`, ''];

function validateAll(rows: RawRow[], label: string): Scheme[] {
  const schemes: Scheme[] = [];
  const ids = new Set<string>();
  let errors = 0;
  let warnings = 0;
  const lines: string[] = [];
  rows.forEach((raw, i) => {
    const res = validateRow(raw);
    const id = String(raw['Scheme_ID'] ?? `row ${i + 2}`);
    if (ids.has(id)) {
      errors++;
      lines.push(`- ${id}: duplicate Scheme_ID`);
    }
    ids.add(id);
    for (const e of res.errors) {
      errors++;
      lines.push(`- ERROR ${id} / ${e.field}: ${e.message}`);
    }
    warnings += res.warnings.length;
    if (res.scheme) schemes.push(res.scheme);
  });
  const review = schemes.filter((s) => s.reviewStatus === 'needs_review');
  report.push(
    `## ${label}`,
    '',
    `- Rows: ${rows.length}`,
    `- Valid schemes: ${schemes.length}`,
    `- Errors: ${errors}`,
    `- Warnings (missing description or verification date): ${warnings}`,
    `- Needs review (hidden from the public site until an admin confirms): ${review.length}`,
    '',
    ...lines,
    '',
  );
  if (review.length) {
    report.push('Needs review:', '', ...review.map((s) => `- ${s.id} ${s.name}: ${s.sourceNote}`), '');
  }
  if (errors) throw new Error(`${label}: ${errors} error(s), see report`);
  return schemes;
}

function writePublic(state: string, schemes: Scheme[]) {
  const slug = STATE_SLUGS[state]!;
  const file = {
    state,
    version: 0,
    generatedAt: new Date().toISOString(),
    schemes: toPublicSchemes(schemes),
  };
  writeFileSync(resolve(publicDir, `schemes-${slug}.json`), JSON.stringify(file));
  report.push(`Public file schemes-${slug}.json: ${file.schemes.length} schemes published.`, '');
}

async function main() {
  writeFileSync(resolve(dataDir, 'Scheme_Template.xlsx'), await buildSchemesWorkbook([]));

  const legacy = await parseLegacyWorkbook(
    readFileSync(resolve(dataDir, 'Delhi_Yojana_Master_With_Links.xlsx')),
    'Delhi',
  );
  if (legacy.fatal.length) throw new Error(legacy.fatal.join('; '));
  report.push('## Delhi legacy conversion issues', '', ...legacy.issues.map((i) => `- ${i.schemeId} / ${i.field}: ${i.message} (${i.original || 'blank'})`), '');
  const delhi = validateAll(legacy.rows, 'Delhi (from Delhi_Yojana_Master_With_Links.xlsx)');
  writeFileSync(resolve(dataDir, 'Delhi_Schemes.xlsx'), await buildSchemesWorkbook(delhi));
  writePublic('Delhi', delhi);

  const mp = validateAll(MP_PROTOTYPE_ROWS, 'Madhya Pradesh (prototype data)');
  writeFileSync(resolve(dataDir, 'MadhyaPradesh_Schemes.xlsx'), await buildSchemesWorkbook(mp));
  writePublic('Madhya Pradesh', mp);

  writeFileSync(resolve(dataDir, 'import-report.md'), report.join('\n'));
  console.log(report.join('\n'));
}

main().catch((e) => {
  writeFileSync(resolve(dataDir, 'import-report.md'), report.join('\n'));
  console.error(e);
  process.exit(1);
});
