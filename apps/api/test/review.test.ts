import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateRow } from '@ujjwal/schemes';
import { upsertScheme } from '../src/services/schemes-store';
import { adminToken, bearer, createTestEnv, type TestEnv } from './helpers';

let env: TestEnv;
let editor: string;
beforeAll(async () => {
  env = await createTestEnv();
  editor = await adminToken(env, 'editor@example.com', 'editor');
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const mk = (id: string, extra: Record<string, unknown>) =>
    validateRow({ Scheme_ID: id, State: 'Delhi', 'Scheme Name': `S ${id}`, Level: 'State', Application_URL: 'https://example.gov.in/', ...extra }).scheme!;
  await upsertScheme(env.db, mk('R-1', { Last_Verified_Date: day(5) }), null);
  await upsertScheme(env.db, mk('R-2', { Last_Verified_Date: day(120) }), null);
  await upsertScheme(env.db, mk('R-3', { Last_Verified_Date: day(400) }), null);
  await upsertScheme(env.db, mk('R-4', {}), null);
  await upsertScheme(env.db, mk('R-5', { Source_Note: 'needs review', Last_Verified_Date: day(1) }), null);
});
afterAll(() => env.close());

const get = (url: string) => env.app.inject({ method: 'GET', url, headers: bearer(editor) });

describe('quarterly review helpers', () => {
  it('lists schemes never verified or older than N days', async () => {
    const ids = async (q: string) => (await get(`/admin/schemes?${q}`)).json().items.map((i: any) => i.id).sort();
    expect(await ids('stale=90')).toEqual(['R-2', 'R-3', 'R-4']);
    expect(await ids('stale=180')).toEqual(['R-3', 'R-4']);
    expect(await ids('stale=3650')).toEqual(['R-4']);
    expect((await get('/admin/schemes?stale=0')).statusCode).toBe(400);
    expect((await get('/admin/schemes?stale=abc')).statusCode).toBe(400);
  });

  it('gives the counts for the review chips', async () => {
    const r = await get('/admin/schemes/summary');
    expect(r.json()).toEqual({ total: 5, active: 5, needsReview: 1, neverVerified: 1, stale90: 2 });
  });
});
