import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateRow } from '@ujjwal/schemes';
import { upsertScheme } from '../src/services/schemes-store';
import { createTestEnv, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const scheme = (over: Record<string, unknown>) =>
  validateRow({
    Scheme_ID: 'T-1',
    State: 'Delhi',
    'Scheme Name': 'Test',
    Level: 'State',
    Application_URL: 'https://example.gov.in/',
    ...over,
  }).scheme!;

describe('public routes', () => {
  it('health check', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/health' });
    expect(r.json()).toEqual({ ok: true });
  });

  it('serves an empty published file for a state without schemes', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/public/schemes/delhi' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ state: 'Delhi', version: 1, schemes: [] });
  });

  it('serves only active, reviewed schemes with cache headers and supports ETag', async () => {
    await upsertScheme(env.db, scheme({ Scheme_ID: 'T-1' }), null);
    await upsertScheme(env.db, scheme({ Scheme_ID: 'T-2', Status: 'inactive' }), null);
    await upsertScheme(env.db, scheme({ Scheme_ID: 'T-3', Source_Note: 'needs review' }), null);
    await upsertScheme(env.db, scheme({ Scheme_ID: 'T-4', State: 'Madhya Pradesh' }), null);
    await env.ctx.store.publish('Delhi');

    const r = await env.app.inject({ method: 'GET', url: '/public/schemes/delhi' });
    expect(r.statusCode).toBe(200);
    expect(r.json().schemes.map((s: any) => s.id)).toEqual(['T-1']);
    expect(r.json().version).toBe(2);
    expect(r.headers['cache-control']).toContain('s-maxage');
    // internal fields never leave the server
    expect(Object.keys(r.json().schemes[0])).not.toContain('sourceNote');
    expect(Object.keys(r.json().schemes[0])).not.toContain('status');

    const etag = r.headers['etag'] as string;
    const again = await env.app.inject({ method: 'GET', url: '/public/schemes/delhi', headers: { 'if-none-match': etag } });
    expect(again.statusCode).toBe(304);
  });

  it('returns 404 for an unknown state', async () => {
    expect((await env.app.inject({ method: 'GET', url: '/public/schemes/goa' })).statusCode).toBe(404);
  });

  it('answers unknown routes and bad JSON without leaking details', async () => {
    expect((await env.app.inject({ method: 'GET', url: '/nope' })).json()).toMatchObject({ code: 'not_found' });
    const r = await env.app.inject({ method: 'POST', url: '/registrations', headers: { 'content-type': 'application/json' }, payload: '{bad' });
    expect(r.statusCode).toBe(400);
    expect(r.body).not.toContain('node_modules');
  });
});

describe('CORS and headers', () => {
  it('allows the configured web origin only', async () => {
    const ok = await env.app.inject({ method: 'OPTIONS', url: '/registrations', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const bad = await env.app.inject({ method: 'OPTIONS', url: '/registrations', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('sets security headers', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/health' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});
