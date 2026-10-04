import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, personalCard, saveCard, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const person = (over: Record<string, unknown> = {}) => personalCard('9876543210', {}, over).people[0]!;

const family = (over: Record<string, unknown> = {}) => ({
  mode: 'family',
  state: 'Madhya Pradesh',
  district: 'Indore',
  address: { house: '12', locality: 'Vijay Nagar', pincode: '452010' },
  family: { income: 200000, category: 'SC', minority: false },
  people: [person({ name: 'Ram', gender: 'Male', age: 40, relation: 'Self', mobile: '9876500002' }), person({ name: 'Sita', relation: 'Spouse', mobile: '9876500003' })],
  consent: { details: true, tracking: false },
  ...over,
});

const post = (payload: unknown) => env.app.inject({ method: 'POST', url: '/registrations', payload: payload as any });

describe('POST /registrations (no login)', () => {
  it('saves a personal card and returns a readable card id', async () => {
    const r = await saveCard(env, '9000000001');
    expect(r.statusCode).toBe(201);
    expect(r.json().cardId).toMatch(/^UR-[A-HJ-NP-Z2-9]{8}$/);
    const { rows } = await env.db.query('SELECT mode, state, district, house, pincode FROM registrations WHERE id = $1', [r.json().id]);
    expect(rows[0]).toEqual({ mode: 'personal', state: 'Delhi', district: 'West Delhi', house: '65', pincode: '110059' });
  });

  it('finds the person by the first mobile number: the same number reuses one user', async () => {
    await saveCard(env, '9000000009');
    await saveCard(env, '9000000009');
    expect((await env.db.query(`SELECT count(*)::int AS n FROM users WHERE mobile = '9000000009'`)).rows[0]).toEqual({ n: 1 });
    expect((await env.db.query(`SELECT count(*)::int AS n FROM registrations r JOIN users u ON u.id = r.user_id WHERE u.mobile = '9000000009'`)).rows[0]).toEqual({ n: 2 });
  });

  it('saves a family card with all members in order', async () => {
    const r = await post(family());
    expect(r.statusCode).toBe(201);
    const { rows } = await env.db.query('SELECT name, relation FROM family_members WHERE registration_id = $1 ORDER BY position', [r.json().id]);
    expect(rows).toEqual([
      { name: 'Ram', relation: 'Self' },
      { name: 'Sita', relation: 'Spouse' },
    ]);
    // the family card belongs to the first member's number
    const owner = await env.db.query(`SELECT u.mobile FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.id = $1`, [r.json().id]);
    expect(owner.rows[0]).toEqual({ mobile: '9876500002' });
  });

  it.each([
    ['unknown state', personalCard('9000000003', { state: 'Goa' })],
    ['district of another state', personalCard('9000000003', { district: 'Indore' })],
    ['bad pincode', personalCard('9000000003', { address: { house: '1', locality: 'x', pincode: '12' } })],
    ['no consent', personalCard('9000000003', { consent: { details: false, tracking: false } })],
    ['personal with two people', personalCard('9000000003', { people: [person(), person()] })],
    ['family without family details', family({ family: null })],
    ['no people', personalCard('9000000003', { people: [] })],
    ['21 people', family({ people: Array.from({ length: 21 }, () => person()) })],
    ['bad mobile', personalCard('12345')],
    ['age 200', personalCard('9000000003', {}, { age: 200 })],
    ['income not a bracket', personalCard('9000000003', {}, { income: 123 })],
    ['unknown education', personalCard('9000000003', {}, { education: 'PhD' })],
    ['unknown special group', personalCard('9000000003', {}, { special: ['Spy'] })],
    ['empty name', personalCard('9000000003', {}, { name: '   ' })],
    ['very long name', personalCard('9000000003', {}, { name: 'a'.repeat(81) })],
    ['string age', personalCard('9000000003', {}, { age: '34' })],
    ['not an object', 'just text'],
  ])('rejects %s', async (_label, payload) => {
    const before = (await env.db.query<{ n: number }>('SELECT count(*)::int AS n FROM registrations')).rows[0]!.n;
    const r = await post(payload);
    // 400 for bad values; 415 when the body is not JSON at all
    expect([400, 415]).toContain(r.statusCode);
    expect(typeof r.json().message).toBe('string');
    expect((await env.db.query<{ n: number }>('SELECT count(*)::int AS n FROM registrations')).rows[0]!.n).toBe(before);
  });

  it('cleans control characters out of names', async () => {
    const r = await saveCard(env, '9000000004', {}, { name: 'Asha\u0000 \n  Devi' });
    expect(r.statusCode).toBe(201);
    const { rows } = await env.db.query('SELECT name FROM family_members WHERE registration_id = $1', [r.json().id]);
    expect(rows[0]!.name).toBe('Asha Devi');
  });

  it('is safe against SQL injection text', async () => {
    const evil = `Robert'); DROP TABLE users;--`;
    const r = await saveCard(env, '9000000005', {}, { name: evil });
    expect(r.statusCode).toBe(201);
    const { rows } = await env.db.query('SELECT name FROM family_members WHERE registration_id = $1', [r.json().id]);
    expect(rows[0]!.name).toBe(evil);
    expect((await env.db.query('SELECT count(*)::int AS n FROM users')).rows[0]!.n).toBeGreaterThan(0);
  });

  it('limits the number of saved cards per mobile number', async () => {
    for (let i = 0; i < 10; i++) expect((await saveCard(env, '9000000006')).statusCode).toBe(201);
    const r = await saveCard(env, '9000000006');
    expect(r.statusCode).toBe(409);
    // a different number is not affected
    expect((await saveCard(env, '9000000016')).statusCode).toBe(201);
  });

  it('links the browser session to the person only when tracking consent is given', async () => {
    const sid = 'abcdef1234567890';
    await env.db.query(`INSERT INTO events (ts, session_id, type) VALUES (now(), $1, 'page_view')`, [sid]);

    await saveCard(env, '9000000007', { sessionId: sid, consent: { details: true, tracking: false } });
    expect((await env.db.query('SELECT 1 FROM session_users WHERE session_id = $1', [sid])).rows).toHaveLength(0);
    expect((await env.db.query('SELECT user_id FROM events WHERE session_id = $1', [sid])).rows[0]!.user_id).toBeNull();

    await saveCard(env, '9000000008', { sessionId: sid, consent: { details: true, tracking: true } });
    expect((await env.db.query('SELECT 1 FROM session_users WHERE session_id = $1', [sid])).rows).toHaveLength(1);
    expect((await env.db.query('SELECT user_id FROM events WHERE session_id = $1', [sid])).rows[0]!.user_id).not.toBeNull();
  });

  it('is rate limited per address when limits are on', async () => {
    const limited = await createTestEnv({ NODE_ENV: 'development' });
    const codes: number[] = [];
    for (let i = 0; i < 62; i++) codes.push((await saveCard(limited, `90000${String(10000 + i)}`)).statusCode);
    expect(codes.slice(0, 60).every((c) => c === 201)).toBe(true);
    expect(codes.slice(60)).toEqual([429, 429]);
    await limited.close();
  }, 120_000);
});

describe('there is nothing to read back without a login', () => {
  it.each([
    ['GET', '/registrations'],
    ['GET', '/registrations/mine'],
    ['DELETE', '/me'],
    ['POST', '/auth/otp/send'],
    ['POST', '/auth/otp/verify'],
  ])('%s %s does not exist', async (method, url) => {
    const r = await env.app.inject({ method: method as any, url, payload: method === 'POST' ? { mobile: '9876543210' } : undefined });
    expect([404, 405]).toContain(r.statusCode);
  });
});
