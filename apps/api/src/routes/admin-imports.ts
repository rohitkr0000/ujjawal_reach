import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { STATES } from '@ujjwal/schemes';
import type { AppContext } from '../context';
import { badRequest, notFound } from '../lib/errors';
import { toCsv } from '../lib/csv';
import { parse } from '../lib/validate';
import { requireAdmin } from '../plugins/auth';
import { audit } from '../services/audit';
import { cancelImport, confirmImport, createPreview, loadImport, rollbackImport } from '../services/importer';

const summaryOf = (i: any) => ({
  id: i.id,
  filename: i.filename,
  state: i.state,
  status: i.status,
  onError: i.on_error,
  total: i.rows_total,
  new: i.rows_new,
  updated: i.rows_updated,
  unchanged: i.rows_unchanged,
  errors: i.rows_error,
  createdAt: i.created_at,
  appliedAt: i.applied_at,
  rolledBackAt: i.rolled_back_at,
  admin: i.admin_email ?? null,
});

export function adminImportRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const editor = requireAdmin(app, ctx, ['super_admin', 'editor']);
  const superAdmin = requireAdmin(app, ctx, ['super_admin']);

  /** Step 1: upload an .xlsx. Returns the preview. Nothing is saved to the schemes yet. */
  app.post('/admin/imports', { preHandler: editor }, async (req, reply) => {
    if (!req.isMultipart()) throw badRequest('Send the file as multipart/form-data');
    let buffer: Buffer | null = null;
    let filename = 'upload.xlsx';
    let state: string | null = null;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (buffer) throw badRequest('Send only one file');
        filename = part.filename || filename;
        buffer = await part.toBuffer();
        if (part.file.truncated) throw badRequest('File is larger than 5 MB');
      } else if (part.fieldname === 'state') {
        const v = String(part.value || '').trim();
        if (v) {
          if (!(STATES as readonly string[]).includes(v)) throw badRequest('Unknown state');
          state = v;
        }
      }
    }
    if (!buffer) throw badRequest('Choose a file to upload');
    const { summary, rows } = await createPreview(ctx, { adminId: req.adminAuth!.id, filename, buffer, state });
    await audit(ctx, req, 'import_previewed', summary.id, summary);
    return reply.code(201).send({ summary, rows });
  });

  app.get('/admin/imports', { preHandler: editor }, async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }), req.query);
    const { rows } = await db.query(
      `SELECT i.id, i.state, i.filename, i.status, i.on_error, i.rows_total, i.rows_new, i.rows_updated, i.rows_unchanged,
              i.rows_error, i.created_at, i.applied_at, i.rolled_back_at, a.email AS admin_email
         FROM scheme_imports i LEFT JOIN admins a ON a.id = i.admin_id ORDER BY i.created_at DESC LIMIT $1`,
      [q.limit],
    );
    return { items: rows.map(summaryOf) };
  });

  app.get<{ Params: { id: string } }>('/admin/imports/:id', { preHandler: editor }, async (req) => {
    const q = parse(z.object({ action: z.enum(['new', 'updated', 'unchanged', 'error']).optional() }), req.query);
    const imp = await loadImport(ctx, req.params.id);
    if (!imp) throw notFound('Import not found');
    const { rows } = await db.query<any>(
      `SELECT r.row_number, r.scheme_id, r.action, r.errors, r.warnings, r.changed_fields, d.name
         FROM scheme_import_rows r LEFT JOIN LATERAL (SELECT r.data->>'name' AS name) d ON true
        WHERE r.import_id = $1 ${q.action ? 'AND r.action = $2' : ''} ORDER BY r.row_number`,
      q.action ? [req.params.id, q.action] : [req.params.id],
    );
    return {
      summary: summaryOf(imp),
      rows: rows.map((r) => ({
        rowNumber: r.row_number, schemeId: r.scheme_id, name: r.name, action: r.action, errors: r.errors,
        warnings: r.warnings, changedFields: r.changed_fields,
      })),
    };
  });

  /** The rows with errors as a CSV file, to fix in Excel. */
  app.get<{ Params: { id: string } }>('/admin/imports/:id/errors', { preHandler: editor }, async (req, reply) => {
    const imp = await loadImport(ctx, req.params.id);
    if (!imp) throw notFound('Import not found');
    const { rows } = await db.query<any>(
      `SELECT row_number, scheme_id, errors FROM scheme_import_rows WHERE import_id = $1 AND action = 'error' ORDER BY row_number`,
      [req.params.id],
    );
    const lines: Array<Array<string | number>> = [];
    for (const r of rows) for (const e of r.errors) lines.push([r.row_number, r.scheme_id ?? '', e.field, e.message]);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="import-errors-${imp.id.slice(0, 8)}.csv"`)
      .send(toCsv(['Excel row', 'Scheme_ID', 'Column', 'Problem'], lines));
  });

  app.get<{ Params: { id: string } }>('/admin/imports/:id/file', { preHandler: superAdmin }, async (req, reply) => {
    const { rows } = await db.query<{ filename: string; file_data: Buffer | null }>(
      `SELECT filename, file_data FROM scheme_imports WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]?.file_data) throw notFound('The original file is not stored for this import');
    const safe = rows[0].filename.replace(/[^\w.\- ]/g, '_');
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${safe}"`)
      .send(Buffer.from(rows[0].file_data));
  });

  /** Steps 3 to 5: save the valid rows, publish. `onError` decides what happens to rows with errors. */
  app.post<{ Params: { id: string } }>('/admin/imports/:id/confirm', { preHandler: editor }, async (req) => {
    const { onError } = parse(z.object({ onError: z.enum(['cancel', 'skip']).default('cancel') }), req.body ?? {});
    const r = await confirmImport(ctx, req.params.id, req.adminAuth!.id, onError);
    await audit(ctx, req, 'import_applied', r.id, { filename: r.filename, new: r.new, updated: r.updated, onError });
    return r;
  });

  app.post<{ Params: { id: string } }>('/admin/imports/:id/cancel', { preHandler: editor }, async (req) => {
    await cancelImport(ctx, req.params.id);
    await audit(ctx, req, 'import_cancelled', req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/admin/imports/:id/rollback', { preHandler: editor }, async (req) => {
    const r = await rollbackImport(ctx, req.params.id, req.adminAuth!.id);
    await audit(ctx, req, 'import_rolled_back', req.params.id, r);
    return { ok: true, ...r };
  });
}
