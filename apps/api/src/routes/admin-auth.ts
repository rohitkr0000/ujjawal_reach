import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound, tooMany, unauthorized } from '../lib/errors';
import { parse } from '../lib/validate';
import { limit, requireAdmin, requireAdminSetup, signToken } from '../plugins/auth';
import {
  checkPasswordPolicy,
  checkTotp,
  createAdmin,
  dummyCompare,
  hashPassword,
  newTotp,
  normalizeEmail,
  type AdminRow,
  type Role,
} from '../services/admins';
import { audit } from '../services/audit';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const adminView = (a: { id: string; email: string; role: Role }) => ({ id: a.id, email: a.email, role: a.role });

export function adminAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const anyAdmin = requireAdmin(app, ctx);
  const superAdmin = requireAdmin(app, ctx, ['super_admin']);
  const setup = requireAdminSetup(app);

  async function recordFailure(a: AdminRow, req: any, reason: string) {
    const attempts = a.failed_attempts + 1;
    if (attempts >= MAX_FAILED) {
      await db.query(
        `UPDATE admins SET failed_attempts = 0, locked_until = now() + ($2 || ' minutes')::interval WHERE id = $1`,
        [a.id, String(LOCK_MINUTES)],
      );
      await audit(ctx, req, 'admin_locked', a.email, { reason }, { id: a.id, email: a.email });
    } else {
      await db.query(`UPDATE admins SET failed_attempts = $2 WHERE id = $1`, [a.id, attempts]);
    }
    await audit(ctx, req, 'admin_login_failed', a.email, { reason }, { id: a.id, email: a.email });
  }

  app.post('/admin/auth/login', limit(ctx, 10), async (req) => {
    const body = parse(
      z.object({ email: z.string().max(200), password: z.string().max(200), totp: z.string().max(10).optional() }),
      req.body,
    );
    const email = normalizeEmail(body.email);
    const { rows } = await db.query<AdminRow>(`SELECT * FROM admins WHERE email = $1`, [email]);
    const a = rows[0];
    if (!a) {
      await dummyCompare(body.password);
      throw unauthorized('Invalid email or password');
    }
    if (a.locked_until && new Date(a.locked_until).getTime() > Date.now())
      throw tooMany('This account is locked for a while after too many wrong attempts.');
    if (!(await bcrypt.compare(body.password, a.password_hash)) || !a.active) {
      await recordFailure(a, req, 'password');
      throw unauthorized('Invalid email or password');
    }

    if (!a.totp_enabled) {
      return {
        status: 'setup_required' as const,
        setupToken: signToken(app, { sub: a.id, typ: 'admin-setup', email: a.email, role: a.role }),
      };
    }
    if (!body.totp) return { status: 'totp_required' as const };

    const step = checkTotp(a.totp_secret!, a.email, body.totp);
    if (step === null || step <= Number(a.totp_last_step)) {
      await recordFailure(a, req, 'totp');
      throw unauthorized('That code is not correct');
    }
    await db.query(
      `UPDATE admins SET failed_attempts = 0, locked_until = NULL, last_login_at = now(), totp_last_step = $2 WHERE id = $1`,
      [a.id, step],
    );
    await audit(ctx, req, 'admin_login', a.email, null, { id: a.id, email: a.email });
    return {
      status: 'ok' as const,
      token: signToken(app, { sub: a.id, typ: 'admin', email: a.email, role: a.role }),
      admin: adminView(a),
    };
  });

  // First login: create the authenticator secret.
  app.post('/admin/auth/totp/setup', { preHandler: setup, ...limit(ctx, 10) }, async (req) => {
    const { id, email } = req.adminAuth!;
    const cur = await db.query<{ totp_enabled: boolean }>(`SELECT totp_enabled FROM admins WHERE id = $1`, [id]);
    if (!cur.rows[0]) throw unauthorized();
    if (cur.rows[0].totp_enabled) throw forbidden('Two-step login is already set up');
    const totp = newTotp(email);
    await db.query(`UPDATE admins SET totp_secret = $2 WHERE id = $1`, [id, totp.secret.base32]);
    return { secret: totp.secret.base32, otpauthUrl: totp.toString() };
  });

  app.post('/admin/auth/totp/enable', { preHandler: setup, ...limit(ctx, 10) }, async (req) => {
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6 digit code') }), req.body);
    const { id } = req.adminAuth!;
    const { rows } = await db.query<AdminRow>(`SELECT * FROM admins WHERE id = $1`, [id]);
    const a = rows[0];
    if (!a || !a.active) throw unauthorized();
    if (a.totp_enabled) throw forbidden('Two-step login is already set up');
    if (!a.totp_secret) throw badRequest('Start the setup first');
    const step = checkTotp(a.totp_secret, a.email, code);
    if (step === null) throw badRequest('That code is not correct');
    await db.query(
      `UPDATE admins SET totp_enabled = true, totp_last_step = $2, last_login_at = now(), failed_attempts = 0 WHERE id = $1`,
      [id, step],
    );
    await audit(ctx, req, 'admin_totp_enabled', a.email);
    return { status: 'ok' as const, token: signToken(app, { sub: a.id, typ: 'admin', email: a.email, role: a.role }), admin: adminView(a) };
  });

  app.get('/admin/auth/me', { preHandler: anyAdmin }, async (req) => ({ admin: req.adminAuth }));

  app.post('/admin/auth/password', { preHandler: anyAdmin, ...limit(ctx, 5) }, async (req) => {
    const { current, next } = parse(z.object({ current: z.string().max(200), next: z.string().max(200) }), req.body);
    const { rows } = await db.query<AdminRow>(`SELECT * FROM admins WHERE id = $1`, [req.adminAuth!.id]);
    if (!(await bcrypt.compare(current, rows[0]!.password_hash))) throw unauthorized('Current password is not correct');
    checkPasswordPolicy(next);
    await db.query(`UPDATE admins SET password_hash = $2 WHERE id = $1`, [req.adminAuth!.id, await hashPassword(ctx.config, next)]);
    await audit(ctx, req, 'admin_password_changed', req.adminAuth!.email);
    return { ok: true };
  });

  // ---- Admin accounts (super admin only) ----
  app.get('/admin/admins', { preHandler: superAdmin }, async () => {
    const { rows } = await db.query(
      `SELECT id, email, role, active, totp_enabled, created_at, last_login_at FROM admins ORDER BY created_at`,
    );
    return { items: rows };
  });

  app.post('/admin/admins', { preHandler: superAdmin }, async (req, reply) => {
    const body = parse(
      z.object({ email: z.string().max(200), password: z.string().max(200), role: z.enum(['super_admin', 'editor']) }),
      req.body,
    );
    const a = await createAdmin(db, ctx.config, body);
    await audit(ctx, req, 'admin_created', a.email, { role: a.role });
    return reply.code(201).send(a);
  });

  app.patch<{ Params: { id: string } }>('/admin/admins/:id', { preHandler: superAdmin }, async (req) => {
    const body = parse(
      z.object({
        role: z.enum(['super_admin', 'editor']).optional(),
        active: z.boolean().optional(),
        resetTotp: z.boolean().optional(),
        newPassword: z.string().max(200).optional(),
      }),
      req.body,
    );
    const { rows } = await db.query<AdminRow>(`SELECT * FROM admins WHERE id = $1`, [req.params.id]);
    const target = rows[0];
    if (!target) throw notFound('Admin not found');
    const self = target.id === req.adminAuth!.id;
    if (self && (body.active === false || (body.role && body.role !== 'super_admin')))
      throw badRequest('You cannot lock yourself out or lower your own role');

    if (body.role) await db.query(`UPDATE admins SET role = $2 WHERE id = $1`, [target.id, body.role]);
    if (body.active !== undefined) await db.query(`UPDATE admins SET active = $2 WHERE id = $1`, [target.id, body.active]);
    if (body.resetTotp)
      await db.query(`UPDATE admins SET totp_secret = NULL, totp_enabled = false, totp_last_step = 0 WHERE id = $1`, [target.id]);
    if (body.newPassword) {
      checkPasswordPolicy(body.newPassword);
      await db.query(`UPDATE admins SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1`, [
        target.id,
        await hashPassword(ctx.config, body.newPassword),
      ]);
    }
    await audit(ctx, req, 'admin_updated', target.email, { ...body, newPassword: body.newPassword ? '(changed)' : undefined });
    return { ok: true };
  });

  // Used by the audit page.
  app.get('/admin/audit', { preHandler: superAdmin }, async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    const { rows } = await db.query(
      `SELECT id, ts, admin_email, action, target, details, ip FROM audit_log ORDER BY id DESC LIMIT $1`,
      [q.limit],
    );
    return { items: rows };
  });

}
