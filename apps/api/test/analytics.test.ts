import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateRow } from '@ujjwal/schemes';
import { rebuildStats, runMaintenance } from '../src/services/analytics';
import { upsertScheme } from '../src/services/schemes-store';
import { adminToken, bearer, createTestEnv, personalCard, type TestEnv } from './helpers';

let env: TestEnv;
let boss: string;
let editor: string;

const scheme = (id: string, over: Record<string, unknown> = {}) =>
  validateRow({
    Scheme_ID: id,
    State: 'Delhi',
    'Scheme Name': `Scheme ${id}`,
    Level: 'State',
    Application_URL: 'https://example.gov.in/',
    Beneficiary_Type: 'Student',
    Tags: '#featured',
    ...over,
  }).scheme!;

beforeAll(async () => {
  env = await createTestEnv();
  boss = await adminToken(env, 'boss@example.com', 'super_admin');
  editor = await adminToken(env, 'editor@example.com', 'editor');
  await upsertScheme(env.db, scheme('A-1'), null);
  await upsertScheme(env.db, scheme('A-2', { Beneficiary_Type: 'Farmer', Tags: '' }), null);
  await upsertScheme(env.db, scheme('A-3', { State: 'Madhya Pradesh', Beneficiary_Type: 'Farmer' }), null);
});
afterAll(() => env.close());

const send = (body: unknown) => env.app.inject({ method: 'POST', url: '/events', headers: { 'content-type': 'text/plain' }, payload: JSON.stringify(body) });
const ev = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra });
const batch = (sessionId: string, events: unknown[], extra: Record<string, unknown> = {}) => ({ consent: true, sessionId, device: 'mobile', events, ...extra });
const get = (token: string, url: string) => env.app.inject({ method: 'GET', url, headers: bearer(token) });
const count = async (sql: string) => (await env.db.query<{ n: number }>(sql)).rows[0]!.n;

describe('POST /events', () => {
  it('stores nothing without consent and still answers 204', async () => {
    const before = await count('SELECT count(*)::int AS n FROM events');
    for (const body of [
      { consent: false, sessionId: 'session-aaaa1111', events: [ev('page_view')] },
      { sessionId: 'session-aaaa1111', events: [ev('page_view')] },
      null,
    ]) {
      const r = await send(body);
      expect(r.statusCode).toBe(204);
    }
    expect(await count('SELECT count(*)::int AS n FROM events')).toBe(before);
  });

  it('stores events with the scheme tags taken from the server, not from the browser', async () => {
    const r = await send(batch('session-bbbb2222', [ev('page_view'), ev('state_selected', { state: 'Delhi' }), ev('scheme_shown', { schemeId: 'A-1', state: 'Delhi', tags: ['hacked'] }), ev('scheme_clicked', { schemeId: 'A-1', state: 'Delhi' })]));
    expect(r.statusCode).toBe(204);
    const { rows } = await env.db.query<any>(`SELECT type, scheme_id, tags, device, user_id FROM events WHERE session_id = 'session-bbbb2222' ORDER BY id`);
    expect(rows.map((x) => x.type)).toEqual(['page_view', 'state_selected', 'scheme_shown', 'scheme_clicked']);
    expect(rows[2].tags).toEqual(expect.arrayContaining(['delhi', 'featured', 'student']));
    expect(rows[2].tags).not.toContain('hacked');
    expect(rows[2].device).toBe('mobile');
    expect(rows[2].user_id).toBeNull();
  });

  it('drops scheme events for unknown schemes and ones with no scheme id', async () => {
    await send(batch('session-cccc3333', [ev('scheme_shown', { schemeId: 'NOPE-1' }), ev('scheme_clicked'), ev('page_view')]));
    expect(await count(`SELECT count(*)::int AS n FROM events WHERE session_id = 'session-cccc3333'`)).toBe(1);
  });

  it.each([
    ['unknown event type', batch('session-dddd4444', [ev('hack')])],
    ['empty batch', batch('session-dddd4444', [])],
    ['51 events', batch('session-dddd4444', Array.from({ length: 51 }, () => ev('page_view')))],
    ['bad session id', batch('A B C', [ev('page_view')])],
    ['unknown state', batch('session-dddd4444', [ev('state_selected', { state: 'Goa' })])],
    ['too many props', batch('session-dddd4444', [ev('page_view', { props: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, 1])) })])],
    ['object prop', batch('session-dddd4444', [ev('page_view', { props: { a: { b: 1 } } })])],
    ['long prop', batch('session-dddd4444', [ev('page_view', { props: { a: 'x'.repeat(101) } })])],
  ])('rejects %s', async (_l, body) => {
    expect((await send(body)).statusCode).toBe(400);
    expect(await count(`SELECT count(*)::int AS n FROM events WHERE session_id = 'session-dddd4444'`)).toBe(0);
  });

  it('ignores a wrong phone clock', async () => {
    const old = Date.now() - 5 * 24 * 3600 * 1000;
    await send(batch('session-eeee5555', [ev('page_view', { ts: old }), ev('page_view', { ts: Date.now() - 1000 })]));
    const { rows } = await env.db.query<{ ts: Date }>(`SELECT ts FROM events WHERE session_id = 'session-eeee5555' ORDER BY id`);
    expect(Date.now() - new Date(rows[0]!.ts).getTime()).toBeLessThan(5000);
    expect(Date.now() - new Date(rows[1]!.ts).getTime()).toBeLessThan(5000);
  });

  it('accepts normal JSON as well as text/plain', async () => {
    const r = await env.app.inject({ method: 'POST', url: '/events', payload: batch('session-ffff6666', [ev('page_view')]) });
    expect(r.statusCode).toBe(204);
    expect(await count(`SELECT count(*)::int AS n FROM events WHERE session_id = 'session-ffff6666'`)).toBe(1);
  });

  it('events from a session that registered with tracking consent are linked to the person', async () => {
    const sid = 'session-gggg7777';
    await send(batch(sid, [ev('scheme_shown', { schemeId: 'A-1', state: 'Delhi' })]));
    const reg = await env.app.inject({
      method: 'POST', url: '/registrations',
      payload: personalCard('9444444441', { consent: { details: true, tracking: true }, sessionId: sid }, { name: 'Asha', occupation: 'Student', category: 'SC' }) as any,
    });
    expect(reg.statusCode).toBe(201);
    // earlier and later events of the session are both linked
    await send(batch(sid, [ev('scheme_clicked', { schemeId: 'A-1', state: 'Delhi' })]));
    expect(await count(`SELECT count(*)::int AS n FROM events WHERE session_id = '${sid}' AND user_id IS NOT NULL`)).toBe(2);
  });
});

describe('summary tables match the raw events', () => {
  beforeAll(async () => {
    await env.db.query('DELETE FROM events');
    // 3 visitors; 2 pick Delhi; 2 start a form; 1 submits, 1 abandons; shown/clicked schemes
    await send(batch('s-visitor-1', [ev('page_view'), ev('state_selected', { state: 'Delhi' }), ev('mode_selected', { state: 'Delhi' }), ev('form_started', { state: 'Delhi' }), ev('form_submitted', { state: 'Delhi' }), ev('scheme_shown', { schemeId: 'A-1', state: 'Delhi' }), ev('scheme_shown', { schemeId: 'A-2', state: 'Delhi' }), ev('scheme_clicked', { schemeId: 'A-1', state: 'Delhi' })]));
    await send(batch('s-visitor-2', [ev('page_view'), ev('state_selected', { state: 'Delhi' }), ev('form_started', { state: 'Delhi' }), ev('form_abandoned', { state: 'Delhi' })]));
    await send(batch('s-visitor-3', [ev('page_view'), ev('state_selected', { state: 'Madhya Pradesh' }), ev('scheme_shown', { schemeId: 'A-3', state: 'Madhya Pradesh' }), ev('scheme_shown', { schemeId: 'A-1', state: 'Delhi' }), ev('scheme_clicked', { schemeId: 'A-3', state: 'Madhya Pradesh' }), ev('scheme_clicked', { schemeId: 'A-3', state: 'Madhya Pradesh' })]));
    await rebuildStats(env.db, { days: 2 });
  });

  it('scheme counts equal the number of raw events', async () => {
    const raw = await env.db.query<any>(`SELECT scheme_id, count(*) FILTER (WHERE type = 'scheme_shown')::int AS shown, count(*) FILTER (WHERE type = 'scheme_clicked')::int AS clicked FROM events WHERE scheme_id IS NOT NULL GROUP BY scheme_id ORDER BY scheme_id`);
    const sum = await env.db.query<any>(`SELECT scheme_id, sum(shown)::int AS shown, sum(clicked)::int AS clicked FROM daily_scheme_stats GROUP BY scheme_id ORDER BY scheme_id`);
    expect(sum.rows).toEqual(raw.rows);
    expect(raw.rows).toEqual([
      { scheme_id: 'A-1', shown: 2, clicked: 1 },
      { scheme_id: 'A-2', shown: 1, clicked: 0 },
      { scheme_id: 'A-3', shown: 1, clicked: 2 },
    ]);
  });

  it('is safe to run again (no double counting)', async () => {
    await rebuildStats(env.db, { days: 2 });
    await rebuildStats(env.db, { days: 2 });
    expect(await count(`SELECT sum(shown)::int AS n FROM daily_scheme_stats`)).toBe(4);
  });

  it('overview and funnel numbers', async () => {
    const o = await get(editor, '/admin/analytics/overview');
    expect(o.statusCode).toBe(200);
    expect(o.json().totals).toMatchObject({ visitors: 3, stateSelected: 3, formsStarted: 2, formsSubmitted: 1, formsAbandoned: 1, resultsViewed: 2, schemeClicks: 2 });
    expect(o.json().totals.completionRate).toBe(50);

    const f = (await get(editor, '/admin/analytics/funnel')).json();
    expect(f.steps.map((s: any) => [s.step, s.sessions])).toEqual([
      ['visited', 3], ['state_selected', 3], ['mode_selected', 1], ['form_started', 2], ['form_submitted', 1], ['results_viewed', 2], ['scheme_clicked', 2],
    ]);
    const started = f.steps.find((s: any) => s.step === 'form_started');
    expect(started.pctOfFirst).toBeCloseTo(66.7, 1);

    const delhi = (await get(editor, '/admin/analytics/funnel?state=Delhi')).json();
    expect(delhi.steps.find((s: any) => s.step === 'state_selected').sessions).toBe(2);
    expect(delhi.steps.find((s: any) => s.step === 'visited').sessions).toBe(0); // page views have no state
  });

  it('scheme performance with click rate, filters, top and bottom lists', async () => {
    const r = (await get(editor, '/admin/analytics/schemes?minShown=1')).json();
    const by = Object.fromEntries(r.items.map((x: any) => [x.id, x]));
    expect(by['A-1']).toMatchObject({ shown: 2, clicked: 1, rate: 50 });
    expect(by['A-3']).toMatchObject({ shown: 1, clicked: 2, rate: 200 });
    expect(r.items[0].id).toBe('A-3'); // sorted by clicks
    expect(r.top.map((x: any) => x.id)).toEqual(['A-3', 'A-1']);
    expect(r.bottom[0].id).toBe('A-2');

    expect((await get(editor, '/admin/analytics/schemes?state=Madhya%20Pradesh')).json().items.map((x: any) => x.id)).toEqual(['A-3']);
    expect((await get(editor, '/admin/analytics/schemes?tag=%23featured')).json().items.map((x: any) => x.id).sort()).toEqual(['A-1', 'A-3']);
    expect((await get(editor, '/admin/analytics/schemes?sort=name&order=asc')).json().items[0].id).toBe('A-1');
    expect((await get(editor, '/admin/analytics/schemes?from=2000-01-01&to=2000-01-02')).json().items.every((x: any) => x.shown === 0)).toBe(true);
    expect((await get(editor, '/admin/analytics/schemes?sort=bogus')).statusCode).toBe(400);
  });

  it('tag report groups by tag', async () => {
    const r = (await get(editor, '/admin/analytics/tags')).json();
    const by = Object.fromEntries(r.items.map((x: any) => [x.tag, x]));
    expect(by['featured']).toMatchObject({ kind: 'admin', shown: 3, clicked: 3 }); // A-1 x2 shown, A-3 x1; clicks A-1 x1, A-3 x2
    expect(by['farmer']).toMatchObject({ shown: 2, clicked: 2 }); // A-2 and A-3
    expect(by['student']).toMatchObject({ shown: 2, clicked: 1 });
    expect((await get(editor, '/admin/analytics/tags?kind=admin')).json().items.every((x: any) => x.kind === 'admin')).toBe(true);
  });

  it('exports reports as CSV and Excel', async () => {
    const csv = await get(editor, '/admin/analytics/export?report=schemes&format=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Scheme ID,Scheme,State,Level,Tags,Times shown,Clicks,Click rate %');
    expect(csv.body).toContain('A-3');
    const xlsx = await get(editor, '/admin/analytics/export?report=tags');
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    for (const report of ['overview', 'funnel', 'geography']) expect((await get(editor, `/admin/analytics/export?report=${report}&format=csv`)).statusCode).toBe(200);
    expect((await get(editor, '/admin/analytics/export?report=users')).statusCode).toBe(400);
  });

  it('needs a login', async () => {
    expect((await env.app.inject({ method: 'GET', url: '/admin/analytics/overview' })).statusCode).toBe(401);
    expect((await get('not-a-real-token', '/admin/analytics/overview')).statusCode).toBe(401);
  });
});

describe('per-person activity (privacy rules)', () => {
  let userId: string;
  beforeAll(async () => {
    userId = (await env.db.query<{ id: string }>(`SELECT id FROM users WHERE mobile = '9444444441'`)).rows[0]!.id;
    // (the summary tests above cleared the events, so record this person's activity again)
    await send(batch('session-gggg7777', [ev('scheme_shown', { schemeId: 'A-1', state: 'Delhi' }), ev('scheme_clicked', { schemeId: 'A-1', state: 'Delhi' })]));
  });

  it('only a super admin can see it; an editor is refused', async () => {
    expect((await get(editor, '/admin/analytics/users')).statusCode).toBe(403);
    expect((await get(editor, `/admin/analytics/users/${userId}/activity`)).statusCode).toBe(403);
    expect((await get(boss, '/admin/analytics/users')).statusCode).toBe(200);
  });

  it('masks mobile numbers by default and shows the schemes shown and clicked', async () => {
    const list = (await get(boss, '/admin/analytics/users')).json();
    const me = list.items.find((u: any) => u.userId === userId);
    expect(me).toMatchObject({ mobile: '94XXXXXX41', cards: 1, shown: 1, clicked: 1 });
    expect(JSON.stringify(list)).not.toContain('9444444441');

    const a = (await get(boss, `/admin/analytics/users/${userId}/activity`)).json();
    expect(a.user.mobile).toBe('94XXXXXX41');
    expect(a.registrations[0].people[0].mobile).toBe('94XXXXXX41');
    expect(a.shown).toMatchObject([{ schemeId: 'A-1', name: 'Scheme A-1', times: 1 }]);
    expect(a.clicked).toMatchObject([{ schemeId: 'A-1', times: 1 }]);
    expect(a.registrations[0]).toMatchObject({ trackingConsent: true, mode: 'personal' });
  });

  it('revealing a number is allowed for a super admin and every view is written to the audit log', async () => {
    const a = (await get(boss, `/admin/analytics/users/${userId}/activity?reveal=true`)).json();
    expect(a.user.mobile).toBe('9444444441');
    const log = await env.db.query<any>(`SELECT action, details, admin_email FROM audit_log WHERE action = 'user_activity_viewed' ORDER BY id`);
    expect(log.rows.length).toBeGreaterThanOrEqual(2);
    expect(log.rows.at(-1)).toMatchObject({ admin_email: 'boss@example.com', details: { revealedMobile: true } });
    expect((await env.db.query(`SELECT 1 FROM audit_log WHERE action = 'user_list_viewed'`)).rows.length).toBeGreaterThan(0);
  });

  it('search finds a person by card id, full mobile or member name', async () => {
    const card = (await env.db.query<{ card_id: string }>(`SELECT card_id FROM registrations WHERE user_id = $1`, [userId])).rows[0]!.card_id;
    for (const q of [card, card.toLowerCase(), '9444444441', 'Asha']) {
      const r = (await get(boss, `/admin/analytics/users?q=${encodeURIComponent(q)}`)).json();
      expect(r.items.map((u: any) => u.userId)).toContain(userId);
    }
    expect((await get(boss, '/admin/analytics/users?q=nobody-here')).json().total).toBe(0);
  });

  it('404 for an unknown or malformed user id', async () => {
    expect((await get(boss, '/admin/analytics/users/00000000-0000-4000-8000-000000000000/activity')).statusCode).toBe(404);
    expect((await get(boss, '/admin/analytics/users/not-a-uuid/activity')).statusCode).toBe(400);
  });

  it('geography counts registrations and clicks per district', async () => {
    const g = (await get(editor, '/admin/analytics/geography')).json();
    expect(g.items).toContainEqual({ state: 'Delhi', district: 'West Delhi', registrations: 1, clicks: 1 });
  });

  it('a super admin can delete one person\'s data; an editor cannot', async () => {
    expect((await env.app.inject({ method: 'DELETE', url: `/admin/users/${userId}`, headers: bearer(editor) })).statusCode).toBe(403);
    expect((await env.app.inject({ method: 'DELETE', url: `/admin/users/${userId}`, headers: bearer(boss) })).statusCode).toBe(204);
    expect(await count(`SELECT count(*)::int AS n FROM events WHERE user_id = '${userId}'`)).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM registrations WHERE user_id = '${userId}'`)).toBe(0);
    expect((await get(boss, `/admin/analytics/users/${userId}/activity`)).statusCode).toBe(404);
  });
});

describe('retention and rebuild', () => {
  it('deletes events older than 12 months, keeps the summaries', async () => {
    await env.db.query(`INSERT INTO events (ts, session_id, type) VALUES (now() - interval '13 months', 'old-session-1', 'page_view'), (now() - interval '11 months', 'old-session-2', 'page_view')`);
    const r = await runMaintenance(env.db);
    expect(r.events).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM events WHERE session_id LIKE 'old-session-%'`)).toBe(1);
    expect(await count('SELECT count(*)::int AS n FROM daily_scheme_stats')).toBeGreaterThan(0);
  });

  it('deletes stale import previews', async () => {
    await env.db.query(`INSERT INTO scheme_imports (id, filename, file_sha256, status, created_at) VALUES (gen_random_uuid(), 'old.xlsx', 'x', 'preview', now() - interval '15 days')`);
    const r = await runMaintenance(env.db);
    expect(r.previews).toBe(1);
  });

  it('only a super admin can rebuild the statistics', async () => {
    expect((await env.app.inject({ method: 'POST', url: '/admin/analytics/rebuild', headers: bearer(editor), payload: {} })).statusCode).toBe(403);
    const r = await env.app.inject({ method: 'POST', url: '/admin/analytics/rebuild', headers: bearer(boss), payload: { days: 5 } });
    expect(r.statusCode).toBe(200);
    expect(r.json().from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
