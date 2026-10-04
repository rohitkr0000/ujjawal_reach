import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import type { Config } from '../config';
import type { Db } from '../db';
import { uuid } from '../lib/crypto';
import { badRequest, conflict } from '../lib/errors';

export type Role = 'super_admin' | 'editor';

export interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_last_step: string | number;
  failed_attempts: number;
  locked_until: Date | null;
  active: boolean;
}

export function checkPasswordPolicy(password: string): void {
  if (password.length < 12) throw badRequest('Password must be at least 12 characters');
  if (password.length > 200) throw badRequest('Password is too long');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    throw badRequest('Password must contain letters and numbers');
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const hashPassword = (config: Config, password: string) => bcrypt.hash(password, config.BCRYPT_COST);

// A real hash of nothing in particular, compared against when the email is unknown so that
// "unknown email" and "wrong password" take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);
export const dummyCompare = (password: string) => bcrypt.compare(password, DUMMY_HASH);

export async function createAdmin(
  db: Db,
  config: Config,
  input: { email: string; password: string; role: Role },
): Promise<{ id: string; email: string; role: Role }> {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address');
  checkPasswordPolicy(input.password);
  const exists = await db.query(`SELECT 1 FROM admins WHERE email = $1`, [email]);
  if (exists.rowCount > 0) throw conflict('An admin with this email already exists');
  const id = uuid();
  await db.query(`INSERT INTO admins (id, email, password_hash, role) VALUES ($1,$2,$3,$4)`, [
    id,
    email,
    await hashPassword(config, input.password),
    input.role,
  ]);
  return { id, email, role: input.role };
}

export function newTotp(email: string, secretBase32?: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: 'Ujjwal Reach Admin',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secretBase32 ? OTPAuth.Secret.fromBase32(secretBase32) : new OTPAuth.Secret({ size: 20 }),
  });
}

/**
 * Check a 6 digit code. Returns the time step that matched, or null. A code can only be used once:
 * the caller must reject steps that are not newer than the last accepted one.
 */
export function checkTotp(secretBase32: string, email: string, code: string): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const totp = newTotp(email, secretBase32);
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / 30) + delta;
}
