import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, adminToken, bearer, createTestEnv, type TestEnv } from './helpers';
import { createAdmin } from '../src/services/admins';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const login = (payload: Record<string, unknown>) =>
  env.app.inject({ method: 'POST', url: '/admin/auth/login', payload: payload as any });

describe('admin login and two-step', () => {
  it('first login requires TOTP setup, then logs in with a code', async () => {
    await createAdmin(env.db, env.config, { email: 'First@Example.com', password: PASSWORD, role: 'super_admin' });
    const l1 = await login({ email: 'first@example.com', password: PASSWORD });
    expect(l1.json().status).toBe('setup_required');

    const setupToken = l1.json().setupToken;
    const s = await env.app.inject({ method: 'POST', url: '/admin/auth/totp/setup', headers: bearer(setupToken) });
    expect(s.json().otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const secret = s.json().secret as string;

    // wrong code first
    const bad = await env.app.inject({ method: 'POST', url: '/admin/auth/totp/enable', headers: bearer(setupToken), payload: { code: '000000' } });
    expect(bad.statusCode).toBe(400);

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
    const en = await env.app.inject({ method: 'POST', url: '/admin/auth/totp/enable', headers: bearer(setupToken), payload: { code: totp.generate() } });
    expect(en.statusCode).toBe(200);
    expect(en.json().token).toBeTruthy();

    // the same code cannot be used to log in right after (replay protection)
    const replay = await login({ email: 'first@example.com', password: PASSWORD, totp: totp.generate() });
    expect(replay.statusCode).toBe(401);

    // a later time step is accepted
    const next = totp.generate({ timestamp: Date.now() + 30_000 });
    const ok = await login({ email: 'first@example.com', password: PASSWORD, totp: next });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: 'ok', admin: { email: 'first@example.com', role: 'super_admin' } });

    const me = await env.app.inject({ method: 'GET', url: '/admin/auth/me', headers: bearer(ok.json().token) });
    expect(me.json().admin.email).toBe('first@example.com');
  });

  it('asks for a code when TOTP is enabled and none is sent', async () => {
    await adminToken(env, 'needs-code@example.com');
    const r = await login({ email: 'needs-code@example.com', password: PASSWORD });
    expect(r.json()).toEqual({ status: 'totp_required' });
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    await createAdmin(env.db, env.config, { email: 'known@example.com', password: PASSWORD, role: 'editor' });
    const a = await login({ email: 'nobody@example.com', password: PASSWORD });
    const b = await login({ email: 'known@example.com', password: 'wrong password 123' });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().message).toBe(b.json().message);
  });

  it('locks the account after 5 wrong passwords', async () => {
    await createAdmin(env.db, env.config, { email: 'lock@example.com', password: PASSWORD, role: 'editor' });
    for (let i = 0; i < 5; i++) expect((await login({ email: 'lock@example.com', password: 'wrong password 123' })).statusCode).toBe(401);
    const locked = await login({ email: 'lock@example.com', password: PASSWORD });
    expect(locked.statusCode).toBe(429);
    await env.db.query(`UPDATE admins SET locked_until = now() - interval '1 minute' WHERE email = 'lock@example.com'`);
    expect((await login({ email: 'lock@example.com', password: PASSWORD })).statusCode).toBe(200);
  });

  it('a setup token cannot be used as an admin token and a made-up token cannot reach admin routes', async () => {
    await createAdmin(env.db, env.config, { email: 'setup@example.com', password: PASSWORD, role: 'super_admin' });
    const l = await login({ email: 'setup@example.com', password: PASSWORD });
    const get = (token: string) => env.app.inject({ method: 'GET', url: '/admin/schemes', headers: bearer(token) });
    expect((await get(l.json().setupToken)).statusCode).toBe(401);
    expect((await get('not-a-real-token')).statusCode).toBe(401);
    expect((await env.app.inject({ method: 'GET', url: '/admin/schemes' })).statusCode).toBe(401);
  });

  it('enforces the password policy', async () => {
    for (const pw of ['short1', 'alllettersnonumbers', '1234567890123']) {
      await expect(createAdmin(env.db, env.config, { email: `p${pw.length}@example.com`, password: pw, role: 'editor' })).rejects.toThrow();
    }
  });

  it('deactivating an admin cuts off their token immediately', async () => {
    const token = await adminToken(env, 'victim@example.com', 'editor');
    expect((await env.app.inject({ method: 'GET', url: '/admin/schemes', headers: bearer(token) })).statusCode).toBe(200);
    await env.db.query(`UPDATE admins SET active = false WHERE email = 'victim@example.com'`);
    expect((await env.app.inject({ method: 'GET', url: '/admin/schemes', headers: bearer(token) })).statusCode).toBe(401);
  });
});

describe('admin accounts', () => {
  it('only a super admin can manage admins; cannot lock themselves out', async () => {
    const boss = await adminToken(env, 'boss@example.com', 'super_admin');
    const editor = await adminToken(env, 'ed@example.com', 'editor');

    expect((await env.app.inject({ method: 'GET', url: '/admin/admins', headers: bearer(editor) })).statusCode).toBe(403);
    const list = await env.app.inject({ method: 'GET', url: '/admin/admins', headers: bearer(boss) });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain('password_hash');

    const created = await env.app.inject({ method: 'POST', url: '/admin/admins', headers: bearer(boss), payload: { email: 'new@example.com', password: PASSWORD, role: 'editor' } });
    expect(created.statusCode).toBe(201);
    expect((await env.app.inject({ method: 'POST', url: '/admin/admins', headers: bearer(boss), payload: { email: 'NEW@example.com', password: PASSWORD, role: 'editor' } })).statusCode).toBe(409);

    const me = (await env.db.query<{ id: string }>(`SELECT id FROM admins WHERE email = 'boss@example.com'`)).rows[0]!.id;
    const self = await env.app.inject({ method: 'PATCH', url: `/admin/admins/${me}`, headers: bearer(boss), payload: { active: false } });
    expect(self.statusCode).toBe(400);

    const newId = created.json().id;
    const reset = await env.app.inject({ method: 'PATCH', url: `/admin/admins/${newId}`, headers: bearer(boss), payload: { resetTotp: true, role: 'super_admin' } });
    expect(reset.statusCode).toBe(200);
    expect((await env.db.query(`SELECT role FROM admins WHERE id = $1`, [newId])).rows[0]).toEqual({ role: 'super_admin' });
  });

  it('records admin actions in the audit log', async () => {
    const boss = await adminToken(env, 'audit@example.com', 'super_admin');
    const r = await env.app.inject({ method: 'GET', url: '/admin/audit', headers: bearer(boss) });
    expect(r.statusCode).toBe(200);
    expect(r.json().items.some((i: any) => i.action === 'admin_login_failed')).toBe(true);
  });
});
