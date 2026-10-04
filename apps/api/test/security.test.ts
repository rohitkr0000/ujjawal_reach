import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createTestEnv, bearer, personalCard, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const routesDir = resolve(__dirname, '../src/routes');

/** Every route declared in the source, as METHOD + path. */
function declaredRoutes(): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  for (const f of readdirSync(routesDir)) {
    const src = readFileSync(join(routesDir, f), 'utf-8');
    for (const m of src.matchAll(/app\.(get|post|patch|delete)(?:<[^>]*(?:<[^>]*>[^>]*)*>)?\(\s*'([^']+)'/g)) {
      out.push({ method: m[1]!.toUpperCase(), path: m[2]! });
    }
  }
  return out;
}

describe('every admin route requires an admin login', () => {
  const admin = declaredRoutes().filter((r) => r.path.startsWith('/admin') && r.path !== '/admin/auth/login');

  it('finds the admin routes in the source', () => {
    expect(admin.length).toBeGreaterThan(30);
  });

  it.each(admin.map((r) => [`${r.method} ${r.path}`, r] as const))('%s refuses anonymous and made-up tokens', async (_l, r) => {
    const url = r.path.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000');
    const anon = await env.app.inject({ method: r.method as any, url });
    expect(anon.statusCode).toBe(401);
    const asUser = await env.app.inject({ method: r.method as any, url, headers: bearer('not-a-real-token') });
    expect(asUser.statusCode).toBe(401);
  });
});

describe('no public route returns personal data', () => {
  const routes = declaredRoutes().filter((r) => !r.path.startsWith('/admin'));
  it('the only public routes are the ones we expect', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual(['GET /health', 'GET /public/schemes/:slug', 'POST /events', 'POST /registrations']);
  });
  it('the registration route only writes: its response holds just an id and a card id', async () => {
    const env2 = await createTestEnv();
    const r = await env2.app.inject({ method: 'POST', url: '/registrations', payload: personalCard('9555555500') as any });
    expect(Object.keys(r.json()).sort()).toEqual(['cardId', 'id']);
    await env2.close();
  });
});

const post = (payload: unknown) => env.app.inject({ method: 'POST', url: '/registrations', payload: payload as any });

describe('Aadhaar numbers are refused', () => {
  it.each([
    ['name', personalCard('9555555556', {}, { name: 'Asha 2345 6789 0123' })],
    ['house', personalCard('9555555556', { address: { house: '234567890123', locality: 'x', pincode: '110059' } })],
    ['locality', personalCard('9555555556', { address: { house: '1', locality: 'near 2345-6789-0123', pincode: '110059' } })],
  ])('in the %s field', async (_f, payload) => {
    const r = await post(payload);
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/Aadhaar/);
  });

  it('the database has no Aadhaar column and the routes never read one', () => {
    const migrations = readFileSync(resolve(__dirname, '../src/db/migrations.ts'), 'utf-8');
    expect(migrations).not.toMatch(/aadhaar|aadhar/i);
    for (const f of readdirSync(routesDir)) {
      const src = readFileSync(join(routesDir, f), 'utf-8');
      // the only mention allowed is the refusal message in the registration route
      if (f !== 'registrations.ts') expect(src).not.toMatch(/aadhaar|aadhar/i);
    }
  });
});

describe('boundaries', () => {
  it('rejects a body over 1 MB', async () => {
    const r = await env.app.inject({
      method: 'POST',
      url: '/registrations',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ pad: 'x'.repeat(1_100_000) }),
    });
    expect(r.statusCode).toBe(413);
  });

  it('ignores extra fields sent by the caller (no mass assignment)', async () => {
    const r = await post(
      personalCard('9555555557', { user_id: 'someone-else', card_id: 'UR-HACKED00', id: 'evil' }, { id: 'evil', user_id: 'evil' }),
    );
    expect(r.statusCode).toBe(201);
    expect(r.json().cardId).not.toBe('UR-HACKED00');
    expect(r.json().id).not.toBe('evil');
    const mine = (await env.db.query<{ user_id: string }>(`SELECT user_id FROM registrations WHERE id = $1`, [r.json().id])).rows[0]!;
    expect(mine.user_id).not.toBe('someone-else');
  });

  it('error responses never contain stack traces or SQL', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/admin/schemes?pageSize=abc', headers: bearer('x') });
    expect(r.body).not.toMatch(/node_modules|SELECT|at \w+ \(/);
  });
});

describe('logs never contain tokens', () => {
  it('redacts the authorization header the way the app is configured to', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _e, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const probe = Fastify({ logger: { stream: sink, redact: ['req.headers.authorization'] } });
    probe.get('/x', async (req) => {
      req.log.info({ req: { headers: req.headers } }, 'probe');
      return { ok: true };
    });
    await probe.inject({ method: 'GET', url: '/x', headers: { authorization: 'Bearer SECRET-TOKEN-123' } });
    await probe.close();
    expect(lines.join('')).not.toContain('SECRET-TOKEN-123');
  });

  it('the app source configures that redaction and routes never log request bodies', () => {
    const app = readFileSync(resolve(__dirname, '../src/app.ts'), 'utf-8');
    expect(app).toContain("'req.headers.authorization'");
    const all = readdirSync(routesDir).map((f) => readFileSync(join(routesDir, f), 'utf-8')).join('\n');
    expect(all).not.toMatch(/log\.(info|debug|warn)\([^)]*req\.body/);
  });
});

describe('production configuration is strict', () => {
  const prod = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://x',
    JWT_SECRET: 'j'.repeat(40),
    CORS_ORIGINS: 'https://portal.example.in',
  };
  it('accepts a complete production configuration', () => {
    const c = loadConfig(prod);
    expect(c.isProd).toBe(true);
  });
  it.each([
    ['no database', { DATABASE_URL: '' }],
    ['default JWT secret', { JWT_SECRET: '' }],
    ['wildcard CORS', { CORS_ORIGINS: '*' }],
    ['per-IP limits switched off', { DISABLE_IP_LIMITS: 'true' }],
    ['short secret', { JWT_SECRET: 'short' }],
  ])('refuses to start with %s', (_l, over) => {
    expect(() => loadConfig({ ...prod, ...over })).toThrow();
  });
});
