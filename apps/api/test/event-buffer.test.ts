import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventBuffer, type EventRow } from '../src/services/analytics';
import { createTestEnv, saveCard, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());
beforeEach(async () => {
  await env.db.query('DELETE FROM events');
});

const row = (i: number, session = 'buffer-session-1'): EventRow => ({
  ts: new Date().toISOString(),
  sessionId: session,
  type: 'page_view',
  state: null,
  schemeId: null,
  tags: [],
  device: 'mobile',
  props: { i },
});
const count = async () => (await env.db.query<{ n: number }>('SELECT count(*)::int AS n FROM events')).rows[0]!.n;

describe('EventBuffer', () => {
  it('holds events in memory and writes them in one go on flush', async () => {
    const b = new EventBuffer(env.db, 60_000);
    await b.enqueue([row(1), row(2), row(3)]);
    expect(b.pending).toBe(3);
    expect(await count()).toBe(0);
    expect(await b.flush()).toBe(3);
    expect(b.pending).toBe(0);
    expect(await count()).toBe(3);
  });

  it('writes by itself on the timer', async () => {
    const b = new EventBuffer(env.db, 50);
    b.start();
    await b.enqueue([row(1)]);
    await new Promise((r) => setTimeout(r, 400));
    expect(await count()).toBe(1);
    await b.stop();
  });

  it('writes large batches in chunks and loses nothing', async () => {
    const b = new EventBuffer(env.db, 60_000);
    await b.enqueue(Array.from({ length: 1700 }, (_, i) => row(i)));
    // 1700 >= 2000? no: below the auto-flush threshold, so nothing is written yet
    expect(await count()).toBe(0);
    expect(await b.flush()).toBe(1700);
    expect(await count()).toBe(1700);
  });

  it('flushes by itself when a lot is waiting', async () => {
    const b = new EventBuffer(env.db, 60_000);
    await b.enqueue(Array.from({ length: 2100 }, (_, i) => row(i)));
    expect(b.pending).toBe(0);
    expect(await count()).toBe(2100);
  });

  it('two flushes at once do not write anything twice', async () => {
    const b = new EventBuffer(env.db, 60_000);
    await b.enqueue(Array.from({ length: 50 }, (_, i) => row(i)));
    await Promise.all([b.flush(), b.flush(), b.flush()]);
    expect(await count()).toBe(50);
  });

  it('keeps the events when the database fails, and writes them on the next flush', async () => {
    const logs: string[] = [];
    const b = new EventBuffer(env.db, 60_000, (m) => logs.push(m));
    await b.enqueue([row(1), row(2)]);
    const orig = env.db.query;
    env.db.query = async () => {
      throw new Error('db down');
    };
    expect(await b.flush()).toBe(0);
    env.db.query = orig;
    expect(b.pending).toBe(2);
    expect(logs[0]).toMatch(/db down/);
    expect(await b.flush()).toBe(2);
    expect(await count()).toBe(2);
  });

  it('drops new events (not old ones) when the queue is full, and counts them', async () => {
    const b = new EventBuffer(env.db, 60_000);
    const orig = env.db.query;
    env.db.query = async () => {
      throw new Error('db down');
    };
    for (let i = 0; i < 26; i++) await b.enqueue(Array.from({ length: 2000 }, (_, k) => row(k)));
    env.db.query = orig;
    expect(b.pending).toBeLessThanOrEqual(50_000);
    expect(b.dropped).toBeGreaterThan(0);
  }, 60_000);

  it('links events to the person if their session is already linked', async () => {
    await saveCard(env, '9666666661');
    const userId = (await env.db.query<{ id: string }>(`SELECT id FROM users WHERE mobile = '9666666661'`)).rows[0]!.id;
    await env.db.query(`INSERT INTO session_users (session_id, user_id) VALUES ('buffer-session-2', $1)`, [userId]);
    const b = new EventBuffer(env.db, 60_000);
    await b.enqueue([row(1, 'buffer-session-2'), row(2, 'buffer-session-3')]);
    await b.flush();
    const { rows } = await env.db.query<any>(`SELECT session_id, user_id FROM events ORDER BY session_id`);
    expect(rows).toEqual([
      { session_id: 'buffer-session-2', user_id: userId },
      { session_id: 'buffer-session-3', user_id: null },
    ]);
  });

  it('stop() writes what is left (used at shutdown)', async () => {
    const b = new EventBuffer(env.db, 60_000);
    b.start();
    await b.enqueue([row(1)]);
    await b.stop();
    expect(await count()).toBe(1);
  });
});

describe('buffered tracking through the API', () => {
  it('events sent before a person registers are linked to them (registration flushes first)', async () => {
    const buffered = await createTestEnv();
    // swap in a slow buffer so the event is still in memory when the person registers
    const { EventBuffer: EB } = await import('../src/services/analytics');
    const slow = new EB(buffered.db, 60_000);
    (buffered.ctx as any).events = slow;
    const sid = 'abcdef1234567890';
    const r = await buffered.app.inject({ method: 'POST', url: '/events', headers: { 'content-type': 'text/plain' }, payload: JSON.stringify({ consent: true, sessionId: sid, events: [{ type: 'page_view' }] }) });
    expect(r.statusCode).toBe(204);
    expect(slow.pending).toBe(1);

    const reg = await saveCard(buffered, '9666666662', { consent: { details: true, tracking: true }, sessionId: sid });
    expect(reg.statusCode).toBe(201);
    expect(slow.pending).toBe(0);
    const { rows } = await buffered.db.query<any>(`SELECT user_id FROM events WHERE session_id = $1`, [sid]);
    expect(rows[0].user_id).not.toBeNull();
    await buffered.close();
  });

  it('closing the app writes queued events', async () => {
    const e = await createTestEnv();
    const { EventBuffer: EB } = await import('../src/services/analytics');
    (e.ctx as any).events = new EB(e.db, 60_000);
    await e.app.inject({ method: 'POST', url: '/events', headers: { 'content-type': 'text/plain' }, payload: JSON.stringify({ consent: true, sessionId: 'close-session-1', events: [{ type: 'page_view' }] }) });
    expect((await e.db.query('SELECT 1 FROM events')).rows).toHaveLength(0);
    await e.ctx.events.stop();
    expect((await e.db.query('SELECT 1 FROM events')).rows).toHaveLength(1);
    await e.close();
  });
});
