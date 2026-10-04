import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { forbidden, unauthorized } from '../lib/errors';

export type TokenType = 'admin' | 'admin-setup';

export interface TokenPayload {
  sub: string;
  typ: TokenType;
  email?: string;
  role?: 'super_admin' | 'editor';
}

const EXPIRY: Record<TokenType, string> = { admin: '8h', 'admin-setup': '15m' };

export function signToken(app: FastifyInstance, payload: TokenPayload): string {
  return app.jwt.sign(payload, { expiresIn: EXPIRY[payload.typ] });
}

function readToken(req: FastifyRequest, app: FastifyInstance, typ: TokenType): TokenPayload {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let payload: TokenPayload;
  try {
    payload = app.jwt.verify<TokenPayload>(header.slice(7));
  } catch {
    throw unauthorized('Your session has expired. Please log in again.');
  }
  if (payload.typ !== typ) throw unauthorized();
  return payload;
}

/**
 * Requires a full admin token. The admin is looked up on every call, so deactivating an account
 * or changing a role takes effect immediately.
 */
export function requireAdmin(app: FastifyInstance, ctx: AppContext, roles?: Array<'super_admin' | 'editor'>) {
  return async (req: FastifyRequest) => {
    const p = readToken(req, app, 'admin');
    const { rows } = await ctx.db.query<{ id: string; email: string; role: 'super_admin' | 'editor'; active: boolean }>(
      `SELECT id, email, role, active FROM admins WHERE id = $1`,
      [p.sub],
    );
    const a = rows[0];
    if (!a || !a.active) throw unauthorized();
    if (roles && !roles.includes(a.role)) throw forbidden();
    req.adminAuth = { id: a.id, email: a.email, role: a.role };
  };
}

/** Requires the short-lived token given after a correct password when TOTP is not set up yet. */
export function requireAdminSetup(app: FastifyInstance) {
  return async (req: FastifyRequest) => {
    const p = readToken(req, app, 'admin-setup');
    req.adminAuth = { id: p.sub, email: p.email ?? '', role: p.role ?? 'editor' };
  };
}

/**
 * Per-route rate limit. Tests run every request from one IP address, so the limit is relaxed
 * there; one test turns it back on to prove it works.
 */
export function limit(ctx: AppContext, max: number, timeWindow = '1 minute') {
  return { config: { rateLimit: { max: ctx.config.NODE_ENV === 'test' || ctx.config.DISABLE_IP_LIMITS === 'true' ? max * 1000 : max, timeWindow } } };
}
