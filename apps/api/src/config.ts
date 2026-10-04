import { z } from 'zod';

const csv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional().default(''),
  PGLITE_DIR: z.string().optional().default(''),
  JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-change-me-0123456789'),
  CORS_ORIGINS: z.string().default('http://localhost:3000').transform(csv),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(''),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(''),
  CF_ZONE_ID: z.string().optional().default(''),
  CF_API_TOKEN: z.string().optional().default(''),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  /** Public address of this API (used to purge CDN copies of the scheme files). */
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  /** Optional chat webhook that receives a message when the server hits an unexpected error. */
  ERROR_WEBHOOK_URL: z.string().url().optional().or(z.literal('')).default(''),
  /** Load testing only: all fake users share one IP address, so per-IP limits are switched off. Refused in production. */
  DISABLE_IP_LIMITS: z.enum(['true', 'false']).default('false'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(14).default(12),
  /** Set to "false" to stop the in-process hourly statistics job (for example on extra instances). */
  RUN_JOBS: z.enum(['true', 'false']).default('true'),
});

export type Config = z.infer<typeof schema> & {
  isProd: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Empty values in .env files are treated as "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = schema.parse(cleaned);
  const isProd = parsed.NODE_ENV === 'production';
  if (isProd) {
    const problems: string[] = [];
    if (!parsed.DATABASE_URL) problems.push('DATABASE_URL is required in production');
    if (!cleaned['JWT_SECRET'] || parsed.JWT_SECRET.startsWith('dev-only')) problems.push('JWT_SECRET must be set');
    if (parsed.DISABLE_IP_LIMITS === 'true') problems.push('DISABLE_IP_LIMITS must not be set in production');
    if (parsed.CORS_ORIGINS.some((o) => o === '*')) problems.push('CORS_ORIGINS must not be *');
    if (problems.length) throw new Error(`Invalid production configuration:\n- ${problems.join('\n- ')}`);
  }
  return {
    ...parsed,
    isProd,
  };
}
