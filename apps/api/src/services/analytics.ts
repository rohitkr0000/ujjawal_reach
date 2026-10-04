import { STATES } from '@ujjwal/schemes';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { maskMobile } from '../lib/crypto';

export const EVENT_TYPES = [
  'page_view',
  'state_selected',
  'mode_selected',
  'form_started',
  'form_step_completed',
  'form_submitted',
  'form_abandoned',
  'scheme_shown',
  'scheme_clicked',
] as const;

const SCHEME_EVENTS = new Set(['scheme_shown', 'scheme_clicked']);

const propsSchema = z
  .record(z.string().max(30), z.union([z.string().max(100), z.number(), z.boolean()]))
  .refine((p) => Object.keys(p).length <= 8, 'Too many props');

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  ts: z.number().int().optional(),
  state: z.enum(STATES).optional(),
  schemeId: z.string().regex(/^[A-Za-z0-9_-]{2,32}$/).optional(),
  props: propsSchema.optional(),
});

export const eventsBodySchema = z.object({
  consent: z.literal(true),
  sessionId: z.string().regex(/^[a-z0-9-]{8,64}$/),
  device: z.enum(['mobile', 'desktop']).optional(),
  events: z.array(eventSchema).min(1).max(50),
});

const DAY = 24 * 3600 * 1000;

export interface EventRow {
  ts: string;
  sessionId: string;
  type: string;
  state: string | null;
  schemeId: string | null;
  tags: string[];
  device: string | null;
  props: Record<string, string | number | boolean>;
}

const MAX_QUEUE = 50_000;
const CHUNK = 500;

/**
 * Collects tracking events in memory and writes them to the database in big batches, so
 * thousands of visitors cause a handful of inserts per second instead of thousands.
 * With intervalMs = 0 every call writes straight away (used by the tests).
 * A crash can lose the last second of tracking events, which is acceptable for statistics.
 */
export class EventBuffer {
  private queue: EventRow[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<number> | null = null;
  dropped = 0;

  constructor(
    private db: Db,
    private intervalMs: number,
    private log: (msg: string) => void = console.error,
  ) {}

  start(): void {
    if (this.intervalMs > 0 && !this.timer) {
      this.timer = setInterval(() => void this.flush(), this.intervalMs);
      this.timer.unref();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  get pending(): number {
    return this.queue.length;
  }

  async enqueue(rows: EventRow[]): Promise<void> {
    if (this.queue.length + rows.length > MAX_QUEUE) {
      this.dropped += rows.length;
      return; // overloaded or database down: statistics are the first thing to give up
    }
    this.queue.push(...rows);
    if (this.intervalMs === 0 || this.queue.length >= CHUNK * 4) await this.flush();
  }

  /** Write everything queued. Runs one write at a time; returns how many rows were written. */
  async flush(): Promise<number> {
    if (this.flushing) {
      await this.flushing;
      if (this.queue.length === 0) return 0;
    }
    this.flushing = this.writeAll().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async writeAll(): Promise<number> {
    let written = 0;
    while (this.queue.length > 0) {
      const rows = this.queue.splice(0, CHUNK);
      try {
        await this.write(rows);
        written += rows.length;
      } catch (e) {
        this.log(`event write failed, will retry: ${e instanceof Error ? e.message : e}`);
        if (this.queue.length + rows.length <= MAX_QUEUE) this.queue.unshift(...rows);
        else this.dropped += rows.length;
        break;
      }
    }
    return written;
  }

  private async write(rows: EventRow[]): Promise<void> {
    const sessions = [...new Set(rows.map((r) => r.sessionId))];
    const users = await this.db.query<{ session_id: string; user_id: string }>(
      `SELECT session_id, user_id FROM session_users WHERE session_id IN (SELECT jsonb_array_elements_text($1::jsonb))`,
      [JSON.stringify(sessions)],
    );
    const userOf = new Map(users.rows.map((u) => [u.session_id, u.user_id]));
    const values: unknown[] = [];
    const tuples: string[] = [];
    for (const r of rows) {
      const i = values.length;
      values.push(r.ts, r.sessionId, userOf.get(r.sessionId) ?? null, r.type, r.state, r.schemeId, JSON.stringify(r.tags), r.device, JSON.stringify(r.props));
      tuples.push(`($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7}::jsonb,$${i + 8},$${i + 9}::jsonb)`);
    }
    await this.db.query(
      `INSERT INTO events (ts, session_id, user_id, type, state, scheme_id, tags, device, props) VALUES ${tuples.join(',')}`,
      values,
    );
  }
}

/**
 * Validate a batch of events and hand them to the buffer. Events about schemes that do not exist
 * are dropped, and each event is stamped with the scheme's tags as they are now (the browser is
 * never trusted for tags). Returns how many events were accepted.
 */
export async function ingestEvents(ctx: AppContext, body: z.infer<typeof eventsBodySchema>): Promise<number> {
  const now = Date.now();
  const rows: EventRow[] = [];
  for (const e of body.events) {
    let tags: string[] = [];
    if (SCHEME_EVENTS.has(e.type)) {
      if (!e.schemeId) continue;
      const t = await ctx.store.tagsOf(e.schemeId);
      if (!t) continue;
      tags = t;
    }
    // A wrong phone clock must not put events in the past or the future.
    const ts = e.ts && Math.abs(e.ts - now) < DAY ? e.ts : now;
    rows.push({ ts: new Date(ts).toISOString(), sessionId: body.sessionId, type: e.type, state: e.state ?? null, schemeId: e.schemeId ?? null, tags, device: body.device ?? null, props: e.props ?? {} });
  }
  if (rows.length) await ctx.events.enqueue(rows);
  return rows.length;
}

// ---------------------------------------------------------------------------------------------
// Summary jobs
// ---------------------------------------------------------------------------------------------

const IST = `'Asia/Kolkata'`;
const dayOf = (col: string) => `(${col} AT TIME ZONE ${IST})::date`;
/** The start of an India day as a timestamp, for index-friendly filters. */
const startOf = (param: string) => `(${param}::date::timestamp AT TIME ZONE ${IST})`;

export const todayIst = (): string => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
export const daysAgoIst = (n: number): string => new Date(Date.now() + 5.5 * 3600 * 1000 - n * DAY).toISOString().slice(0, 10);

const FUNNEL_CASE = `CASE type
    WHEN 'page_view' THEN 'visited'
    WHEN 'state_selected' THEN 'state_selected'
    WHEN 'mode_selected' THEN 'mode_selected'
    WHEN 'form_started' THEN 'form_started'
    WHEN 'form_submitted' THEN 'form_submitted'
    WHEN 'form_abandoned' THEN 'form_abandoned'
    WHEN 'scheme_shown' THEN 'results_viewed'
    WHEN 'scheme_clicked' THEN 'scheme_clicked'
  END`;

export const FUNNEL_STEPS = [
  'visited',
  'state_selected',
  'mode_selected',
  'form_started',
  'form_submitted',
  'results_viewed',
  'scheme_clicked',
] as const;

/**
 * Recompute the summary tables from the raw events for the last `days` India days (or from
 * `fromDay`). Safe to run any time and as often as wanted: it replaces the same days each time.
 */
export async function rebuildStats(db: Db, opts: { days?: number; fromDay?: string } = {}): Promise<{ from: string }> {
  const from = opts.fromDay ?? daysAgoIst((opts.days ?? 3) - 1);
  await db.tx(async (t) => {
    await t.query(`DELETE FROM daily_scheme_stats WHERE day >= $1::date`, [from]);
    await t.query(
      `INSERT INTO daily_scheme_stats (day, scheme_id, state, shown, clicked)
       SELECT ${dayOf('ts')}, scheme_id, max(state),
              (count(*) FILTER (WHERE type = 'scheme_shown'))::int,
              (count(*) FILTER (WHERE type = 'scheme_clicked'))::int
         FROM events
        WHERE ts >= ${startOf('$1')} AND scheme_id IS NOT NULL AND type IN ('scheme_shown', 'scheme_clicked')
        GROUP BY ${dayOf('ts')}, scheme_id`,
      [from],
    );

    await t.query(`DELETE FROM daily_tag_stats WHERE day >= $1::date`, [from]);
    await t.query(
      `INSERT INTO daily_tag_stats (day, tag, shown, clicked)
       SELECT ${dayOf('e.ts')}, x.tag,
              (count(*) FILTER (WHERE e.type = 'scheme_shown'))::int,
              (count(*) FILTER (WHERE e.type = 'scheme_clicked'))::int
         FROM events e CROSS JOIN LATERAL jsonb_array_elements_text(e.tags) AS x(tag)
        WHERE e.ts >= ${startOf('$1')} AND e.type IN ('scheme_shown', 'scheme_clicked')
        GROUP BY ${dayOf('e.ts')}, x.tag`,
      [from],
    );

    await t.query(`DELETE FROM daily_funnel_stats WHERE day >= $1::date`, [from]);
    // Per state (events that know their state) ...
    await t.query(
      `INSERT INTO daily_funnel_stats (day, state, step, sessions)
       SELECT ${dayOf('ts')}, state, ${FUNNEL_CASE}, (count(DISTINCT session_id))::int
         FROM events
        WHERE ts >= ${startOf('$1')} AND state IS NOT NULL AND ${FUNNEL_CASE} IS NOT NULL
        GROUP BY ${dayOf('ts')}, state, ${FUNNEL_CASE}`,
      [from],
    );
    // ... and for all visitors together (includes page views, which have no state).
    await t.query(
      `INSERT INTO daily_funnel_stats (day, state, step, sessions)
       SELECT ${dayOf('ts')}, 'ALL', ${FUNNEL_CASE}, (count(DISTINCT session_id))::int
         FROM events
        WHERE ts >= ${startOf('$1')} AND ${FUNNEL_CASE} IS NOT NULL
        GROUP BY ${dayOf('ts')}, ${FUNNEL_CASE}`,
      [from],
    );
  });
  return { from };
}

/** Delete data that is past its retention: events after 12 months and stale import previews. */
export async function runMaintenance(db: Db): Promise<{ events: number; previews: number }> {
  const ev = await db.query(`DELETE FROM events WHERE ts < now() - interval '12 months'`);
  const pv = await db.query(`DELETE FROM scheme_imports WHERE status IN ('preview', 'cancelled') AND created_at < now() - interval '14 days'`);
  return { events: ev.rowCount, previews: pv.rowCount };
}

// ---------------------------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------------------------

export interface Range {
  from: string;
  to: string;
  state?: string;
}

export const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  state: z.enum(STATES).optional(),
});

export function toRange(q: z.infer<typeof rangeSchema>): Range {
  return { from: q.from ?? daysAgoIst(29), to: q.to ?? todayIst(), state: q.state };
}

const rate = (clicked: number, shown: number) => (shown > 0 ? Math.round((clicked / shown) * 1000) / 10 : 0);

export async function funnelReport(db: Db, r: Range) {
  const { rows } = await db.query<{ step: string; sessions: number }>(
    `SELECT step, COALESCE(sum(sessions), 0)::int AS sessions FROM daily_funnel_stats
      WHERE day BETWEEN $1::date AND $2::date AND state = $3 GROUP BY step`,
    [r.from, r.to, r.state ?? 'ALL'],
  );
  const by = Object.fromEntries(rows.map((x) => [x.step, x.sessions]));
  const first = by[FUNNEL_STEPS[0]] ?? 0;
  let prev: number | null = null;
  const steps = FUNNEL_STEPS.map((step) => {
    const sessions = by[step] ?? 0;
    const out = {
      step,
      sessions,
      pctOfPrevious: prev === null ? 100 : prev > 0 ? Math.min(100, Math.round((sessions / prev) * 1000) / 10) : 0,
      pctOfFirst: first > 0 ? Math.min(100, Math.round((sessions / first) * 1000) / 10) : 0,
      lostFromPrevious: prev === null ? 0 : Math.max(0, prev - sessions),
    };
    prev = sessions;
    return out;
  });
  return { range: r, steps, abandoned: by['form_abandoned'] ?? 0 };
}

export async function overviewReport(db: Db, r: Range) {
  const funnel = await funnelReport(db, r);
  const s = (k: string) => funnel.steps.find((x) => x.step === k)?.sessions ?? 0;
  const regWhere = `${dayOf('created_at')} BETWEEN $1::date AND $2::date ${r.state ? 'AND state = $3' : ''}`;
  const regParams = r.state ? [r.from, r.to, r.state] : [r.from, r.to];
  const regs = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM registrations WHERE ${regWhere}`, regParams)).rows[0]!.n;

  const series = await db.query<{ day: string; step: string; sessions: number }>(
    `SELECT day::text AS day, step, sessions FROM daily_funnel_stats
      WHERE day BETWEEN $1::date AND $2::date AND state = $3 AND step IN ('visited', 'form_started', 'form_submitted')`,
    [r.from, r.to, r.state ?? 'ALL'],
  );
  const regSeries = await db.query<{ day: string; n: number }>(
    `SELECT ${dayOf('created_at')}::text AS day, count(*)::int AS n FROM registrations WHERE ${regWhere} GROUP BY 1`,
    regParams,
  );
  const days = new Map<string, { day: string; visited: number; formsStarted: number; formsSubmitted: number; registrations: number }>();
  const get = (day: string) => {
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, visited: 0, formsStarted: 0, formsSubmitted: 0, registrations: 0 }));
    return d;
  };
  for (const x of series.rows) {
    const d = get(x.day);
    if (x.step === 'visited') d.visited = x.sessions;
    if (x.step === 'form_started') d.formsStarted = x.sessions;
    if (x.step === 'form_submitted') d.formsSubmitted = x.sessions;
  }
  for (const x of regSeries.rows) get(x.day).registrations = x.n;

  const started = s('form_started');
  return {
    range: r,
    totals: {
      visitors: s('visited'),
      stateSelected: s('state_selected'),
      formsStarted: started,
      formsSubmitted: s('form_submitted'),
      formsAbandoned: funnel.abandoned,
      resultsViewed: s('results_viewed'),
      schemeClicks: s('scheme_clicked'),
      registrations: regs,
      completionRate: started > 0 ? Math.min(100, Math.round((s('form_submitted') / started) * 1000) / 10) : 0,
    },
    series: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export const schemeReportQuery = rangeSchema.extend({
  level: z.enum(['State', 'Central', 'State & Central']).optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(['shown', 'clicked', 'rate', 'name']).default('clicked'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  minShown: z.coerce.number().int().min(0).default(5),
});

export interface SchemeRow {
  id: string;
  name: string;
  state: string;
  level: string;
  tags: string[];
  shown: number;
  clicked: number;
  rate: number;
}

export async function schemeRows(db: Db, q: z.infer<typeof schemeReportQuery>): Promise<SchemeRow[]> {
  const r = toRange(q);
  const params: unknown[] = [r.from, r.to];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll('$?', `$${params.length}`));
  };
  if (r.state) add('s.state = $?', r.state);
  if (q.level) add('s.level = $?', q.level);
  if (q.tag) add('s.tags @> $?::jsonb', JSON.stringify([q.tag.replace(/^#/, '').toLowerCase()]));
  if (q.q) add('(s.name ILIKE $? OR s.id ILIKE $?)', `%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
  const { rows } = await db.query<any>(
    `SELECT s.id, s.name, s.state, s.level, s.tags,
            COALESCE(sum(d.shown), 0)::int AS shown, COALESCE(sum(d.clicked), 0)::int AS clicked
       FROM schemes s
       LEFT JOIN daily_scheme_stats d ON d.scheme_id = s.id AND d.day BETWEEN $1::date AND $2::date
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY s.id, s.name, s.state, s.level, s.tags`,
    params,
  );
  return rows.map((x) => ({ ...x, rate: rate(x.clicked, x.shown) }));
}

export async function schemesReport(db: Db, q: z.infer<typeof schemeReportQuery>) {
  const all = await schemeRows(db, q);
  const dir = q.order === 'asc' ? 1 : -1;
  const key = q.sort;
  const sorted = [...all].sort((a, b) => {
    const c = key === 'name' ? a.name.localeCompare(b.name) : (a[key] as number) - (b[key] as number);
    return c === 0 ? a.name.localeCompare(b.name) : c * dir;
  });
  const top = [...all].filter((x) => x.clicked > 0).sort((a, b) => b.clicked - a.clicked || b.rate - a.rate).slice(0, 10);
  // "Bottom" only counts schemes shown often enough for the click rate to mean something.
  const bottom = [...all].filter((x) => x.shown >= q.minShown).sort((a, b) => a.rate - b.rate || b.shown - a.shown).slice(0, 10);
  return {
    range: toRange(q),
    total: all.length,
    page: q.page,
    pageSize: q.pageSize,
    items: sorted.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    top,
    bottom,
    minShown: q.minShown,
  };
}

export async function tagsReport(db: Db, r: Range & { kind?: 'auto' | 'admin' }) {
  const { rows } = await db.query<any>(
    `SELECT t.tag, t.kind,
            (SELECT count(*)::int FROM scheme_tags st WHERE st.tag = t.tag) AS schemes,
            COALESCE(sum(d.shown), 0)::int AS shown, COALESCE(sum(d.clicked), 0)::int AS clicked
       FROM tags t LEFT JOIN daily_tag_stats d ON d.tag = t.tag AND d.day BETWEEN $1::date AND $2::date
      ${r.kind ? 'WHERE t.kind = $3' : ''}
      GROUP BY t.tag, t.kind ORDER BY clicked DESC, shown DESC, t.tag`,
    r.kind ? [r.from, r.to, r.kind] : [r.from, r.to],
  );
  return { range: r, items: rows.map((x: any) => ({ ...x, rate: rate(x.clicked, x.shown) })) };
}

export async function geographyReport(db: Db, r: Range) {
  const params: unknown[] = [r.from, r.to];
  if (r.state) params.push(r.state);
  const { rows } = await db.query<any>(
    `WITH latest AS (
        SELECT DISTINCT ON (user_id) user_id, state, district FROM registrations ORDER BY user_id, created_at DESC
     )
     SELECT g.state, g.district, g.registrations,
            COALESCE((SELECT count(*) FROM events e JOIN latest l ON l.user_id = e.user_id
                       WHERE l.state = g.state AND l.district = g.district AND e.type = 'scheme_clicked'
                         AND e.ts >= ${startOf('$1')} AND e.ts < ${startOf('$2')} + interval '1 day'), 0)::int AS clicks
       FROM (SELECT state, district, count(*)::int AS registrations FROM registrations
              WHERE ${dayOf('created_at')} BETWEEN $1::date AND $2::date ${r.state ? 'AND state = $3' : ''}
              GROUP BY state, district) g
      ORDER BY g.registrations DESC, g.district`,
    params,
  );
  return { range: r, items: rows };
}

export async function usersReport(db: Db, q: { q?: string; page: number; pageSize: number }) {
  const params: unknown[] = [];
  let where = '';
  if (q.q) {
    params.push(q.q.trim());
    params.push(`%${q.q.trim().replace(/[%_\\]/g, '\\$&')}%`);
    where = `WHERE u.mobile = $1 OR EXISTS (SELECT 1 FROM registrations r WHERE r.user_id = u.id AND r.card_id = upper($1))
             OR EXISTS (SELECT 1 FROM registrations r JOIN family_members m ON m.registration_id = r.id WHERE r.user_id = u.id AND m.name ILIKE $2)`;
  }
  const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users u ${where}`, params)).rows[0]!.n;
  const { rows } = await db.query<any>(
    `SELECT u.id, u.mobile, u.created_at,
            (SELECT count(*)::int FROM registrations r WHERE r.user_id = u.id) AS cards,
            (SELECT count(*)::int FROM events e WHERE e.user_id = u.id AND e.type = 'scheme_shown') AS shown,
            (SELECT count(*)::int FROM events e WHERE e.user_id = u.id AND e.type = 'scheme_clicked') AS clicked,
            (SELECT max(e.ts) FROM events e WHERE e.user_id = u.id) AS last_activity
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    params,
  );
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((u) => ({
      userId: u.id,
      mobile: maskMobile(u.mobile),
      createdAt: u.created_at,
      cards: u.cards,
      shown: u.shown,
      clicked: u.clicked,
      lastActivity: u.last_activity,
    })),
  };
}

export async function userActivity(db: Db, userId: string, reveal: boolean) {
  const u = await db.query<{ id: string; mobile: string; created_at: Date }>(`SELECT id, mobile, created_at FROM users WHERE id = $1`, [userId]);
  if (!u.rows[0]) return null;
  const m = (mobile: string) => (reveal ? mobile : maskMobile(mobile));

  const regs = await db.query<any>(
    `SELECT id, card_id, mode, state, district, consent_tracking, created_at FROM registrations WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  const registrations = [];
  for (const r of regs.rows) {
    const people = await db.query<any>(
      `SELECT name, relation, mobile, gender, age, occupation, education, category FROM family_members WHERE registration_id = $1 ORDER BY position`,
      [r.id],
    );
    registrations.push({
      cardId: r.card_id, mode: r.mode, state: r.state, district: r.district, trackingConsent: r.consent_tracking, createdAt: r.created_at,
      people: people.rows.map((p: any) => ({ ...p, mobile: m(p.mobile) })),
    });
  }

  const perScheme = async (type: 'scheme_shown' | 'scheme_clicked') =>
    (
      await db.query<any>(
        `SELECT e.scheme_id, s.name, s.tags, count(*)::int AS times, min(e.ts) AS first_at, max(e.ts) AS last_at
           FROM events e LEFT JOIN schemes s ON s.id = e.scheme_id
          WHERE e.user_id = $1 AND e.type = $2 GROUP BY e.scheme_id, s.name, s.tags ORDER BY times DESC, last_at DESC`,
        [userId, type],
      )
    ).rows.map((x) => ({ schemeId: x.scheme_id, name: x.name, tags: x.tags ?? [], times: x.times, firstAt: x.first_at, lastAt: x.last_at }));

  const timeline = await db.query<any>(
    `SELECT e.ts, e.type, e.scheme_id, s.name FROM events e LEFT JOIN schemes s ON s.id = e.scheme_id
      WHERE e.user_id = $1 ORDER BY e.ts DESC LIMIT 200`,
    [userId],
  );
  return {
    user: { id: u.rows[0].id, mobile: m(u.rows[0].mobile), createdAt: u.rows[0].created_at },
    registrations,
    shown: await perScheme('scheme_shown'),
    clicked: await perScheme('scheme_clicked'),
    timeline: timeline.rows.map((t) => ({ ts: t.ts, type: t.type, schemeId: t.scheme_id, name: t.name })),
  };
}
