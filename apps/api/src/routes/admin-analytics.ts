import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { AppContext } from '../context';
import { toCsv } from '../lib/csv';
import { notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { requireAdmin } from '../plugins/auth';
import {
  funnelReport,
  geographyReport,
  overviewReport,
  rangeSchema,
  rebuildStats,
  schemeReportQuery,
  schemeRows,
  schemesReport,
  tagsReport,
  toRange,
  userActivity,
  usersReport,
} from '../services/analytics';
import { audit } from '../services/audit';
import { safeCell } from '@ujjwal/schemes';

type Table = { name: string; headers: string[]; rows: Array<Array<string | number>> };

export function adminAnalyticsRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const editor = requireAdmin(app, ctx, ['super_admin', 'editor']);
  const superAdmin = requireAdmin(app, ctx, ['super_admin']);

  app.get('/admin/analytics/overview', { preHandler: editor }, async (req) => overviewReport(db, toRange(parse(rangeSchema, req.query))));
  app.get('/admin/analytics/funnel', { preHandler: editor }, async (req) => funnelReport(db, toRange(parse(rangeSchema, req.query))));
  app.get('/admin/analytics/schemes', { preHandler: editor }, async (req) => schemesReport(db, parse(schemeReportQuery, req.query)));
  app.get('/admin/analytics/tags', { preHandler: editor }, async (req) => {
    const q = parse(rangeSchema.extend({ kind: z.enum(['auto', 'admin']).optional() }), req.query);
    return tagsReport(db, { ...toRange(q), kind: q.kind });
  });
  app.get('/admin/analytics/geography', { preHandler: editor }, async (req) => geographyReport(db, toRange(parse(rangeSchema, req.query))));

  // ---- Per-person data: super admin only, masked by default, every view is logged ----
  const userList = z.object({
    q: z.string().max(60).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  });
  app.get('/admin/analytics/users', { preHandler: superAdmin }, async (req) => {
    const q = parse(userList, req.query);
    await audit(ctx, req, 'user_list_viewed', null, { q: q.q ? '(search)' : null });
    return usersReport(db, q);
  });

  app.get<{ Params: { id: string } }>('/admin/analytics/users/:id/activity', { preHandler: superAdmin }, async (req) => {
    const { reveal } = parse(z.object({ reveal: z.enum(['true', 'false']).default('false').transform((v) => v === 'true') }), req.query);
    const id = parse(z.string().uuid(), req.params.id);
    const data = await userActivity(db, id, reveal);
    if (!data) throw notFound('User not found');
    await audit(ctx, req, 'user_activity_viewed', id, { revealedMobile: reveal });
    return data;
  });

  /** Delete one person's data (they asked for it). */
  app.delete<{ Params: { id: string } }>('/admin/users/:id', { preHandler: superAdmin }, async (req, reply) => {
    const id = parse(z.string().uuid(), req.params.id);
    const u = await db.query<{ mobile: string }>(`SELECT mobile FROM users WHERE id = $1`, [id]);
    if (!u.rows[0]) throw notFound('User not found');
    await db.tx(async (t) => {
      await t.query(`DELETE FROM events WHERE user_id = $1`, [id]);
      await t.query(`DELETE FROM users WHERE id = $1`, [id]);
    });
    await audit(ctx, req, 'user_data_deleted', id);
    return reply.code(204).send();
  });

  app.post('/admin/analytics/rebuild', { preHandler: superAdmin }, async (req) => {
    const body = parse(z.object({ days: z.number().int().min(1).max(730).default(3), full: z.boolean().default(false) }), req.body ?? {});
    const r = await rebuildStats(db, { days: body.full ? 730 : body.days });
    await audit(ctx, req, 'analytics_rebuilt', null, body);
    return r;
  });

  // ---- Export any report as CSV or Excel ----
  const exportQuery = rangeSchema.extend({
    report: z.enum(['overview', 'funnel', 'schemes', 'tags', 'geography']),
    format: z.enum(['csv', 'xlsx']).default('xlsx'),
  });
  app.get('/admin/analytics/export', { preHandler: editor }, async (req, reply) => {
    const q = parse(exportQuery, req.query);
    const range = toRange(q);
    let t: Table;
    if (q.report === 'overview') {
      const o = await overviewReport(db, range);
      t = { name: 'Overview', headers: ['Day', 'Visitors', 'Forms started', 'Forms submitted', 'Registrations'], rows: o.series.map((d) => [d.day, d.visited, d.formsStarted, d.formsSubmitted, d.registrations]) };
    } else if (q.report === 'funnel') {
      const f = await funnelReport(db, range);
      t = { name: 'Funnel', headers: ['Step', 'Sessions', '% of previous step', '% of first step'], rows: f.steps.map((s) => [s.step, s.sessions, s.pctOfPrevious, s.pctOfFirst]) };
    } else if (q.report === 'schemes') {
      const all = (await schemeRows(db, parse(schemeReportQuery, req.query))).sort((x, y) => y.clicked - x.clicked || x.name.localeCompare(y.name));
      t = { name: 'Schemes', headers: ['Scheme ID', 'Scheme', 'State', 'Level', 'Tags', 'Times shown', 'Clicks', 'Click rate %'], rows: all.map((x) => [x.id, x.name, x.state, x.level, x.tags.map((g) => `#${g}`).join(' '), x.shown, x.clicked, x.rate]) };
    } else if (q.report === 'tags') {
      const g = await tagsReport(db, range);
      t = { name: 'Tags', headers: ['Tag', 'Kind', 'Schemes', 'Times shown', 'Clicks', 'Click rate %'], rows: g.items.map((x: any) => [`#${x.tag}`, x.kind, x.schemes, x.shown, x.clicked, x.rate]) };
    } else {
      const g = await geographyReport(db, range);
      t = { name: 'Geography', headers: ['State', 'District', 'Registrations', 'Scheme clicks'], rows: g.items.map((x: any) => [x.state, x.district, x.registrations, x.clicks]) };
    }
    await audit(ctx, req, 'analytics_exported', q.report, { format: q.format });
    const file = `Ujjwal_${t.name}_${range.from}_to_${range.to}`;
    if (q.format === 'csv') {
      return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${file}.csv"`).send(toCsv(t.headers, t.rows));
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t.name);
    ws.addRow(t.headers).font = { bold: true };
    for (const r of t.rows) ws.addRow(r.map((c) => (typeof c === 'string' ? safeCell(c) : c)));
    ws.columns.forEach((c) => (c.width = 22));
    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${file}.xlsx"`)
      .send(buf);
  });
}
