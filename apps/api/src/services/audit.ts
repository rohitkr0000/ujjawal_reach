import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import type { Db } from '../db';

/** Write one line of the audit log. Never throws: a logging problem must not block the action. */
export async function audit(
  ctx: Pick<AppContext, 'db'> | { db: Db },
  req: Pick<FastifyRequest, 'adminAuth' | 'ip'> | null,
  action: string,
  target: string | null = null,
  details: unknown = null,
  adminOverride?: { id: string; email: string },
): Promise<void> {
  try {
    const a = adminOverride ?? req?.adminAuth ?? null;
    await ctx.db.query(
      `INSERT INTO audit_log (admin_id, admin_email, action, target, details, ip) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [a?.id ?? null, a?.email ?? null, action, target, JSON.stringify(details), req?.ip ?? null],
    );
  } catch (e) {
    console.error('audit log failed', e);
  }
}
