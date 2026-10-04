import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrations } from './migrations';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** The small slice of a database client the API uses. Same SQL on PGlite (dev/test) and Postgres. */
export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run several statements without parameters (used for migrations). */
  exec(sql: string): Promise<void>;
  /** Run `fn` in a transaction. Throwing rolls everything back. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** In-process Postgres (WASM). Used for local development and tests. */
export async function createPgliteDb(dir = ''): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) mkdirSync(dirname(dir), { recursive: true });
  const pg = dir ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  const wrap = (c: {
    query: (sql: string, params?: any[]) => Promise<any>;
    exec: (sql: string) => Promise<unknown>;
  }): Omit<Db, 'tx' | 'close'> => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await c.query(sql, params as any[]);
      return { rows: r.rows as T[], // For SELECT (or RETURNING) the row count is the number of rows; for plain writes it is affectedRows.
      rowCount: (r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0)) as number };
    },
    async exec(sql: string) {
      await c.exec(sql);
    },
  });
  const db: Db = {
    ...wrap(pg),
    tx: (fn) =>
      pg.transaction(async (t) => {
        const inner: Db = {
          ...wrap(t as any),
          tx: (f) => f(inner), // already inside a transaction
          close: async () => undefined,
        };
        return fn(inner);
      }),
    close: () => pg.close(),
  };
  return db;
}

/** Real Postgres through a connection pool. Used in production. */
export async function createPgDb(connectionString: string, opts: { schema?: string } = {}): Promise<Db> {
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;
  const ssl = /sslmode=disable|localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false };
  if (opts.schema) {
    // Used by the tests: every test app gets its own empty schema in one shared database.
    const admin = new Pool({ connectionString, max: 1, ssl });
    await admin.query(`CREATE SCHEMA "${opts.schema}"`);
    await admin.end();
  }
  const pool = new Pool({
    connectionString,
    max: 10,
    ssl,
    idleTimeoutMillis: 30_000,
    ...(opts.schema ? { options: `-c search_path="${opts.schema}"` } : {}),
  });
  // Return dates and counts in forms JSON can carry.
  const wrap = (c: { query: (sql: string, params?: unknown[]) => Promise<any> }): Omit<Db, 'tx' | 'close'> => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await c.query(sql, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
    },
    async exec(sql: string) {
      await c.query(sql);
    },
  });
  const db: Db = {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inner: Db = { ...wrap(client), tx: (f) => f(inner), close: async () => undefined };
        const out = await fn(inner);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      if (opts.schema) await pool.query(`DROP SCHEMA "${opts.schema}" CASCADE`).catch(() => undefined);
      await pool.end();
    },
  };
  return db;
}

/** Hindi text and the rupee sign need a UTF-8 database. Refuse to run on anything else. */
export async function assertUtf8(db: Db): Promise<void> {
  const { rows } = await db.query<{ enc: string }>(`SELECT current_setting('server_encoding') AS enc`);
  const enc = rows[0]?.enc ?? '';
  if (enc.toUpperCase() !== 'UTF8') throw new Error(`The database encoding is ${enc}, it must be UTF8`);
}

/** Apply every migration that has not been applied yet. Safe to run on every start. */
export async function migrate(db: Db): Promise<string[]> {
  await assertUtf8(db);
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const done = new Set((await db.query<{ id: string }>('SELECT id FROM schema_migrations')).rows.map((r) => r.id));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.tx(async (t) => {
      await t.exec(m.sql);
      await t.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    });
    applied.push(m.id);
  }
  return applied;
}
