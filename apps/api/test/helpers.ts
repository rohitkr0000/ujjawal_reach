import type { FastifyInstance } from 'fastify';
import * as OTPAuth from 'otpauth';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import type { AppContext } from '../src/context';
import { createPgDb, createPgliteDb, migrate, type Db } from '../src/db';
import { createAdmin } from '../src/services/admins';

export interface TestEnv {
  app: FastifyInstance;
  ctx: AppContext;
  db: Db;
  config: Config;
  close: () => Promise<void>;
}

/** A fresh app on an in-memory Postgres (PGlite). */
export async function createTestEnv(extra: Record<string, string> = {}): Promise<TestEnv> {
  const config = loadConfig({
    NODE_ENV: 'test',
    BCRYPT_COST: '4',
    RUN_JOBS: 'false',
    ...extra,
  });
  // TEST_DATABASE_URL runs the whole suite on a real Postgres server (each test app gets its own
  // schema). Without it the tests use the built-in PGlite database.
  const url = process.env['TEST_DATABASE_URL'];
  const db = url ? await createPgDb(url, { schema: `t_${Math.random().toString(36).slice(2, 10)}` }) : await createPgliteDb();
  await migrate(db);
  const { app, ctx } = await buildApp({ db, config });
  await app.ready();
  return {
    app,
    ctx,
    db,
    config,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

export const MOBILE = '9876543210';

/** A valid request body for POST /registrations (a personal card). Override any field. */
export function personalCard(mobile = MOBILE, over: Record<string, unknown> = {}, person: Record<string, unknown> = {}) {
  return {
    mode: 'personal',
    state: 'Delhi',
    district: 'West Delhi',
    address: { house: '65', locality: 'Shakti Colony', pincode: '110059' },
    family: null,
    people: [
      {
        name: 'Asha Devi',
        relation: 'Self',
        mobile,
        gender: 'Female',
        age: 34,
        education: 'Secondary',
        occupation: 'Daily Wages',
        income: 100000,
        category: 'OBC',
        minority: false,
        special: [],
        ...person,
      },
    ],
    consent: { details: true, tracking: false },
    ...over,
  };
}

/** Submit a personal card. */
export const saveCard = (e: TestEnv, mobile = MOBILE, over: Record<string, unknown> = {}, person: Record<string, unknown> = {}) =>
  e.app.inject({ method: 'POST', url: '/registrations', payload: personalCard(mobile, over, person) as any });

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export const PASSWORD = 'correct horse 42 battery';

/** Create an admin, finish the two-step setup and return a full admin token. */
export async function adminToken(e: TestEnv, email: string, role: 'super_admin' | 'editor' = 'super_admin'): Promise<string> {
  await createAdmin(e.db, e.config, { email, password: PASSWORD, role });
  const l = await e.app.inject({ method: 'POST', url: '/admin/auth/login', payload: { email, password: PASSWORD } });
  const setupToken = l.json().setupToken;
  const s = await e.app.inject({ method: 'POST', url: '/admin/auth/totp/setup', headers: bearer(setupToken) });
  const secret = s.json().secret as string;
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  const en = await e.app.inject({ method: 'POST', url: '/admin/auth/totp/enable', headers: bearer(setupToken), payload: { code } });
  if (en.statusCode !== 200) throw new Error(en.body);
  return en.json().token;
}

/** Build a multipart/form-data body for app.inject. */
export function multipart(
  file: { name?: string; filename: string; data: Buffer; type?: string } | null,
  fields: Record<string, string> = {},
): { payload: Buffer; headers: Record<string, string> } {
  const CRLF = '\r\n';
  const boundary = `----test${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${file.name ?? 'file'}"; filename="${file.filename}"${CRLF}` +
          `Content-Type: ${file.type ?? 'application/octet-stream'}${CRLF}${CRLF}`,
      ),
      file.data,
      Buffer.from(CRLF),
    );
  }
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
