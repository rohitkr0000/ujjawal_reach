import { createHash } from 'node:crypto';
import { MAX_IMPORT_BYTES, schemeFingerprint, validateRow, type RowIssue, type Scheme } from '@ujjwal/schemes';
import { parseSchemesWorkbook } from '@ujjwal/schemes/excel';
import type { AppContext } from '../context';
import { uuid } from '../lib/crypto';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
import { purgeSchemeFiles } from './cdn';
import { deleteScheme, getSchemesByIds, upsertScheme } from './schemes-store';

export type RowAction = 'new' | 'updated' | 'unchanged' | 'error';

export interface PreviewRow {
  rowNumber: number;
  schemeId: string | null;
  name: string | null;
  action: RowAction;
  errors: RowIssue[];
  warnings: RowIssue[];
  changedFields: string[];
}

export interface ImportSummary {
  id: string;
  filename: string;
  state: string | null;
  status: string;
  total: number;
  new: number;
  updated: number;
  unchanged: number;
  errors: number;
}

const COMPARED_FIELDS: Array<keyof Scheme> = [
  'state', 'name', 'sector', 'level', 'scope', 'genderFocus', 'ageMin', 'ageMax', 'castes', 'beneficiaries',
  'incomeMax', 'education', 'residence', 'channel', 'url', 'description', 'descriptionHi', 'status',
  'lastVerified', 'sourceNote', 'reviewStatus', 'tags',
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffSchemes(before: Scheme, after: Scheme): string[] {
  return COMPARED_FIELDS.filter((k) => !same(before[k], after[k])).map(String);
}

/** Step 1 and 2 of an import: read the file, check every row and store a preview. Nothing goes live. */
export async function createPreview(
  ctx: AppContext,
  input: { adminId: string | null; filename: string; buffer: Buffer; state: string | null },
): Promise<{ summary: ImportSummary; rows: PreviewRow[] }> {
  const { filename, buffer, state } = input;
  if (!/\.xlsx$/i.test(filename)) throw badRequest('Only .xlsx files are accepted (not .xlsm, .xls or .csv)');
  if (buffer.length > MAX_IMPORT_BYTES) throw new AppError(413, 'File is larger than 5 MB', 'too_large');

  const parsed = await parseSchemesWorkbook(buffer);
  if (parsed.fatal.length) throw badRequest(parsed.fatal.join('. '), { fatal: parsed.fatal });
  if (parsed.rows.length === 0) throw badRequest('The "Schemes" sheet has no schemes');

  const firstRowOfId = new Map<string, number>();
  const rows: PreviewRow[] = [];
  const valid: Array<{ index: number; scheme: Scheme }> = [];

  for (const pr of parsed.rows) {
    const res = validateRow(pr.raw);
    const errors = [...res.errors];
    const id = res.scheme?.id ?? (String(pr.raw['Scheme_ID'] ?? '').trim() || null);
    if (id) {
      const seen = firstRowOfId.get(id);
      if (seen !== undefined) errors.push({ field: 'Scheme_ID', message: `Duplicate of row ${seen}` });
      else firstRowOfId.set(id, pr.rowNumber);
    }
    if (res.scheme && state && res.scheme.state !== state)
      errors.push({ field: 'State', message: `Row is for ${res.scheme.state} but this upload is for ${state}` });

    const row: PreviewRow = {
      rowNumber: pr.rowNumber,
      schemeId: id,
      name: res.scheme?.name ?? (String(pr.raw['Scheme Name'] ?? '').trim() || null),
      action: errors.length ? 'error' : 'new',
      errors,
      warnings: res.warnings,
      changedFields: [],
    };
    rows.push(row);
    if (!errors.length && res.scheme) valid.push({ index: rows.length - 1, scheme: res.scheme });
  }

  const existing = await getSchemesByIds(ctx.db, valid.map((v) => v.scheme.id));
  for (const v of valid) {
    const before = existing.get(v.scheme.id);
    const row = rows[v.index]!;
    if (!before) row.action = 'new';
    else if (schemeFingerprint(before) === schemeFingerprint(v.scheme)) row.action = 'unchanged';
    else {
      row.action = 'updated';
      row.changedFields = diffSchemes(before, v.scheme);
    }
  }

  const count = (a: RowAction) => rows.filter((r) => r.action === a).length;
  const id = uuid();
  const summary: ImportSummary = {
    id,
    filename,
    state,
    status: 'preview',
    total: rows.length,
    new: count('new'),
    updated: count('updated'),
    unchanged: count('unchanged'),
    errors: count('error'),
  };

  const byRow = new Map(valid.map((v) => [v.index, v.scheme]));
  await ctx.db.tx(async (db) => {
    await db.query(
      `INSERT INTO scheme_imports (id, state, filename, file_sha256, file_data, admin_id, status, rows_total, rows_new,
          rows_updated, rows_unchanged, rows_error)
       VALUES ($1,$2,$3,$4,$5,$6,'preview',$7,$8,$9,$10,$11)`,
      [id, state, filename.slice(0, 200), createHash('sha256').update(buffer).digest('hex'), buffer, input.adminId,
        summary.total, summary.new, summary.updated, summary.unchanged, summary.errors],
    );
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      await db.query(
        `INSERT INTO scheme_import_rows (import_id, row_number, scheme_id, action, errors, warnings, changed_fields, data)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)`,
        [id, r.rowNumber, r.schemeId, r.action, JSON.stringify(r.errors), JSON.stringify(r.warnings),
          JSON.stringify(r.changedFields), byRow.has(i) ? JSON.stringify(byRow.get(i)) : null],
      );
    }
  });
  return { summary, rows };
}

export async function loadImport(ctx: AppContext, id: string) {
  const { rows } = await ctx.db.query<any>(
    `SELECT i.id, i.state, i.filename, i.status, i.on_error, i.rows_total, i.rows_new, i.rows_updated, i.rows_unchanged,
            i.rows_error, i.created_at, i.applied_at, i.rolled_back_at, a.email AS admin_email
       FROM scheme_imports i LEFT JOIN admins a ON a.id = i.admin_id WHERE i.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Step 3 to 5: save the valid rows in one transaction, then publish the affected states. */
export async function confirmImport(
  ctx: AppContext,
  importId: string,
  adminId: string | null,
  onError: 'cancel' | 'skip',
): Promise<ImportSummary & { published: string[] }> {
  const imp = await loadImport(ctx, importId);
  if (!imp) throw notFound('Import not found');
  if (imp.status !== 'preview') throw conflict(`This import is already ${imp.status}`);
  if (imp.rows_error > 0 && onError === 'cancel')
    throw conflict(`${imp.rows_error} row(s) have errors. Fix the file, or choose to skip the rows with errors.`);

  const { rows } = await ctx.db.query<{ action: RowAction; data: Scheme }>(
    `SELECT action, data FROM scheme_import_rows WHERE import_id = $1 AND action IN ('new','updated') ORDER BY row_number`,
    [importId],
  );
  const states = new Set<string>();
  let added = 0;
  let changed = 0;

  await ctx.db.tx(async (db) => {
    // Claim the import first so two admins confirming at once cannot both apply it.
    const claim = await db.query(
      `UPDATE scheme_imports SET status = 'applied', applied_at = now(), on_error = $2 WHERE id = $1 AND status = 'preview'`,
      [importId, onError],
    );
    if (claim.rowCount === 0) throw conflict('This import was already applied');

    const existing = await getSchemesByIds(db, rows.map((r) => r.data.id));
    for (const r of rows) {
      const after = r.data;
      const before = existing.get(after.id) ?? null;
      await upsertScheme(db, after, adminId);
      await db.query(
        `INSERT INTO scheme_versions (scheme_id, import_id, admin_id, action, before, after) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [after.id, importId, adminId, before ? 'update' : 'insert', before ? JSON.stringify(before) : null, JSON.stringify(after)],
      );
      states.add(after.state);
      if (before) states.add(before.state);
      if (before) changed++;
      else added++;
    }
  });

  const published = await publishStates(ctx, [...states]);
  return {
    id: importId,
    filename: imp.filename,
    state: imp.state,
    status: 'applied',
    total: imp.rows_total,
    new: added,
    updated: changed,
    unchanged: imp.rows_unchanged,
    errors: imp.rows_error,
    published,
  };
}

export async function publishStates(ctx: AppContext, states: string[]): Promise<string[]> {
  const done: string[] = [];
  for (const s of states) {
    await ctx.store.publish(s);
    done.push(s);
  }
  await purgeSchemeFiles(ctx.config, done);
  return done;
}

export async function cancelImport(ctx: AppContext, importId: string): Promise<void> {
  const r = await ctx.db.query(
    `UPDATE scheme_imports SET status = 'cancelled', file_data = NULL WHERE id = $1 AND status = 'preview'`,
    [importId],
  );
  if (r.rowCount === 0) {
    const imp = await loadImport(ctx, importId);
    if (!imp) throw notFound('Import not found');
    throw conflict(`This import is already ${imp.status}`);
  }
}

/**
 * Put every scheme of an applied import back the way it was. Refused when a newer import or edit
 * has changed any of the same schemes, because that change would be lost.
 */
export async function rollbackImport(ctx: AppContext, importId: string, adminId: string | null): Promise<{ restored: number; removed: number }> {
  const imp = await loadImport(ctx, importId);
  if (!imp) throw notFound('Import not found');
  if (imp.status !== 'applied') throw conflict(`Only an applied import can be rolled back (this one is ${imp.status})`);

  const newer = await ctx.db.query(
    `SELECT v.scheme_id FROM scheme_versions v
      WHERE v.import_id = $1::uuid
        AND EXISTS (SELECT 1 FROM scheme_versions w WHERE w.scheme_id = v.scheme_id AND w.id > v.id
                      AND w.import_id IS DISTINCT FROM $1::uuid
                      AND (w.import_id IS NULL OR EXISTS (SELECT 1 FROM scheme_imports i2 WHERE i2.id = w.import_id AND i2.status = 'applied')))
      LIMIT 5`,
    [importId],
  );
  if (newer.rowCount > 0)
    throw conflict(
      `Newer changes exist for ${newer.rows.map((r: any) => r.scheme_id).join(', ')}. Roll back the newer import or edit first.`,
    );

  const versions = await ctx.db.query<{ scheme_id: string; action: string; before: Scheme | null; after: Scheme | null }>(
    `SELECT scheme_id, action, before, after FROM scheme_versions WHERE import_id = $1 AND action IN ('insert','update') ORDER BY id DESC`,
    [importId],
  );
  const states = new Set<string>();
  let restored = 0;
  let removed = 0;
  await ctx.db.tx(async (db) => {
    const claim = await db.query(
      `UPDATE scheme_imports SET status = 'rolled_back', rolled_back_at = now() WHERE id = $1 AND status = 'applied'`,
      [importId],
    );
    if (claim.rowCount === 0) throw conflict('This import was already rolled back');
    for (const v of versions.rows) {
      if (v.after) states.add(v.after.state);
      if (v.action === 'insert') {
        await deleteScheme(db, v.scheme_id);
        removed++;
      } else if (v.before) {
        await upsertScheme(db, v.before, adminId);
        states.add(v.before.state);
        restored++;
      }
      await db.query(
        `INSERT INTO scheme_versions (scheme_id, import_id, admin_id, action, before, after) VALUES ($1,$2,$3,'rollback',$4::jsonb,$5::jsonb)`,
        [v.scheme_id, importId, adminId, JSON.stringify(v.after), JSON.stringify(v.before)],
      );
    }
  });
  await publishStates(ctx, [...states]);
  return { restored, removed };
}
