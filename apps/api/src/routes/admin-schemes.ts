import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LEVELS, STATES, schemeToRawRow, validateRow, type RawRow, type Scheme } from '@ujjwal/schemes';
import { buildSchemesWorkbook } from '@ujjwal/schemes/excel';
import type { AppContext } from '../context';
import { badRequest, conflict, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { requireAdmin } from '../plugins/auth';
import { audit } from '../services/audit';
import { publishStates } from '../services/importer';
import { deleteScheme, getScheme, rowToScheme, upsertScheme } from '../services/schemes-store';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const listQuery = z.object({
  state: z.enum(STATES).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  review: z.enum(['ok', 'needs_review']).optional(),
  level: z.enum(LEVELS).optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  /** Only schemes never verified, or not verified in the last N days (quarterly review). */
  stale: z.coerce.number().int().min(1).max(3650).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const rowSchema = z.record(z.string().max(60), z.union([z.string().max(2000), z.number(), z.null()]));

export function adminSchemeRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const editor = requireAdmin(app, ctx, ['super_admin', 'editor']);
  const superAdmin = requireAdmin(app, ctx, ['super_admin']);

  app.get('/admin/schemes', { preHandler: editor }, async (req) => {
    const q = parse(listQuery, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replaceAll('$?', `$${params.length}`));
    };
    if (q.state) add('state = $?', q.state);
    if (q.status) add('status = $?', q.status);
    if (q.review) add('review_status = $?', q.review);
    if (q.level) add('level = $?', q.level);
    if (q.tag) add('tags @> $?::jsonb', JSON.stringify([q.tag.replace(/^#/, '').toLowerCase()]));
    if (q.stale) add(`(last_verified IS NULL OR last_verified < to_char(now() - ($?::int * interval '1 day'), 'YYYY-MM-DD'))`, q.stale);
    if (q.q) add(`(name ILIKE $? OR id ILIKE $?)`, `%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM schemes ${w}`, params)).rows[0]!.n;
    const { rows } = await db.query(
      `SELECT id, state, name, sector, level, scope, status, review_status, tags, last_verified, updated_at
         FROM schemes ${w} ORDER BY state, id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      params,
    );
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r: any) => ({
        id: r.id, state: r.state, name: r.name, sector: r.sector, level: r.level, scope: r.scope, status: r.status,
        reviewStatus: r.review_status, tags: r.tags, lastVerified: r.last_verified, updatedAt: r.updated_at,
      })),
    };
  });

  /** Counts for the review chips at the top of the schemes page. */
  app.get('/admin/schemes/summary', { preHandler: editor }, async () => {
    const { rows } = await db.query<any>(
      `SELECT count(*)::int AS total,
              (count(*) FILTER (WHERE status = 'active'))::int AS active,
              (count(*) FILTER (WHERE review_status = 'needs_review'))::int AS needs_review,
              (count(*) FILTER (WHERE last_verified IS NULL))::int AS never_verified,
              (count(*) FILTER (WHERE last_verified < to_char(now() - interval '90 days', 'YYYY-MM-DD')))::int AS stale_90
         FROM schemes`,
    );
    const r = rows[0];
    return { total: r.total, active: r.active, needsReview: r.needs_review, neverVerified: r.never_verified, stale90: r.stale_90 };
  });

  app.get('/admin/template', { preHandler: editor }, async (_req, reply) => {
    const buf = await buildSchemesWorkbook([]);
    return reply
      .header('content-type', XLSX)
      .header('content-disposition', 'attachment; filename="Scheme_Template.xlsx"')
      .send(buf);
  });

  app.get('/admin/schemes/export', { preHandler: editor }, async (req, reply) => {
    const { state } = parse(z.object({ state: z.enum(STATES).optional() }), req.query);
    const { rows } = await db.query(`SELECT * FROM schemes ${state ? 'WHERE state = $1' : ''} ORDER BY state, id`, state ? [state] : []);
    const buf = await buildSchemesWorkbook(rows.map(rowToScheme));
    await audit(ctx, req, 'schemes_exported', state ?? 'all', { count: rows.length });
    const name = `Schemes_${(state ?? 'All').replace(/\s+/g, '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return reply.header('content-type', XLSX).header('content-disposition', `attachment; filename="${name}"`).send(buf);
  });

  app.get('/admin/tags', { preHandler: editor }, async () => {
    const { rows } = await db.query(
      `SELECT t.tag, t.kind, count(st.scheme_id)::int AS schemes
         FROM tags t LEFT JOIN scheme_tags st ON st.tag = t.tag GROUP BY t.tag, t.kind ORDER BY schemes DESC, t.tag`,
    );
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>('/admin/schemes/:id', { preHandler: editor }, async (req) => {
    const s = await getScheme(db, req.params.id);
    if (!s) throw notFound('Scheme not found');
    const versions = await db.query(
      `SELECT v.id, v.action, v.import_id, v.created_at, a.email AS admin_email
         FROM scheme_versions v LEFT JOIN admins a ON a.id = v.admin_id WHERE v.scheme_id = $1 ORDER BY v.id DESC LIMIT 20`,
      [s.id],
    );
    return { scheme: s, row: schemeToRawRow(s), versions: versions.rows };
  });

  /** Create one scheme by hand (same fields as the Excel template). */
  app.post('/admin/schemes', { preHandler: editor }, async (req, reply) => {
    const { row } = parse(z.object({ row: rowSchema }), req.body);
    const res = validateRow(row as RawRow);
    if (!res.scheme) throw badRequest('The scheme has errors', { errors: res.errors });
    if (await getScheme(db, res.scheme.id)) throw conflict(`A scheme with ID ${res.scheme.id} already exists`);
    await db.tx(async (t) => {
      await upsertScheme(t, res.scheme!, req.adminAuth!.id);
      await t.query(`INSERT INTO scheme_versions (scheme_id, admin_id, action, before, after) VALUES ($1,$2,'insert',NULL,$3::jsonb)`, [
        res.scheme!.id, req.adminAuth!.id, JSON.stringify(res.scheme),
      ]);
    });
    await publishStates(ctx, [res.scheme.state]);
    await audit(ctx, req, 'scheme_created', res.scheme.id);
    return reply.code(201).send({ scheme: res.scheme, warnings: res.warnings });
  });

  /** Edit one scheme. Send only the template fields you want to change. */
  app.patch<{ Params: { id: string } }>('/admin/schemes/:id', { preHandler: editor }, async (req) => {
    const { row } = parse(z.object({ row: rowSchema }), req.body);
    const before = await getScheme(db, req.params.id);
    if (!before) throw notFound('Scheme not found');
    const merged = { ...schemeToRawRow(before), ...row, Scheme_ID: before.id } as RawRow;
    const res = validateRow(merged);
    if (!res.scheme) throw badRequest('The scheme has errors', { errors: res.errors });
    const after: Scheme = res.scheme;
    await db.tx(async (t) => {
      await upsertScheme(t, after, req.adminAuth!.id);
      await t.query(`INSERT INTO scheme_versions (scheme_id, admin_id, action, before, after) VALUES ($1,$2,'update',$3::jsonb,$4::jsonb)`, [
        after.id, req.adminAuth!.id, JSON.stringify(before), JSON.stringify(after),
      ]);
    });
    await publishStates(ctx, [...new Set([before.state, after.state])]);
    await audit(ctx, req, 'scheme_edited', after.id, { fields: Object.keys(row) });
    return { scheme: after, warnings: res.warnings };
  });

  /** "I checked the unclear rules": the scheme becomes visible to the public. */
  app.post<{ Params: { id: string } }>('/admin/schemes/:id/confirm-review', { preHandler: editor }, async (req) => {
    const before = await getScheme(db, req.params.id);
    if (!before) throw notFound('Scheme not found');
    if (before.reviewStatus !== 'needs_review') throw conflict('This scheme does not need review');
    const stamp = `Reviewed by ${req.adminAuth!.email} on ${new Date().toISOString().slice(0, 10)}`;
    const note = `${before.sourceNote.replace(/needs[\s_-]*review/gi, 'reviewed')} [${stamp}]`.slice(0, 500);
    const res = validateRow({ ...schemeToRawRow(before), Source_Note: note });
    if (!res.scheme) throw badRequest('The scheme has errors', { errors: res.errors });
    const after = res.scheme;
    await db.tx(async (t) => {
      await upsertScheme(t, after, req.adminAuth!.id);
      await t.query(`INSERT INTO scheme_versions (scheme_id, admin_id, action, before, after) VALUES ($1,$2,'update',$3::jsonb,$4::jsonb)`, [
        after.id, req.adminAuth!.id, JSON.stringify(before), JSON.stringify(after),
      ]);
    });
    await publishStates(ctx, [after.state]);
    await audit(ctx, req, 'scheme_review_confirmed', after.id);
    return { scheme: after };
  });

  app.delete<{ Params: { id: string } }>('/admin/schemes/:id', { preHandler: superAdmin }, async (req, reply) => {
    const before = await getScheme(db, req.params.id);
    if (!before) throw notFound('Scheme not found');
    await db.tx(async (t) => {
      await t.query(`INSERT INTO scheme_versions (scheme_id, admin_id, action, before, after) VALUES ($1,$2,'delete',$3::jsonb,NULL)`, [
        before.id, req.adminAuth!.id, JSON.stringify(before),
      ]);
      await deleteScheme(t, before.id);
    });
    await publishStates(ctx, [before.state]);
    await audit(ctx, req, 'scheme_deleted', before.id, { name: before.name });
    return reply.code(204).send();
  });
}
