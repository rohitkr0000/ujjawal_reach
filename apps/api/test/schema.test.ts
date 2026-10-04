import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPgliteDb, migrate } from '../src/db';
import { buildSchemaSql } from '../src/scripts/export-schema';

describe('deploy/schema.sql', () => {
  it('is up to date with the migrations (run npm run schema:export if this fails)', () => {
    const file = readFileSync(resolve(__dirname, '../../../deploy/schema.sql'), 'utf-8').replace(/\r\n/g, '\n');
    expect(file).toBe(buildSchemaSql().replace(/\r\n/g, '\n'));
  });

  it('builds a working database, and the API then has nothing left to migrate', async () => {
    const db = await createPgliteDb();
    // PGlite runs the file as one script; the real server runs it with psql
    await db.exec(buildSchemaSql());
    const tables = (await db.query<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`)).rows.map((r) => r.t);
    expect(tables).toEqual(
      expect.arrayContaining(['admins', 'audit_log', 'daily_funnel_stats', 'daily_scheme_stats', 'daily_tag_stats', 'events', 'family_members', 'published_schemes', 'registrations', 'scheme_import_rows', 'scheme_imports', 'scheme_tags', 'scheme_versions', 'schemes', 'session_users', 'tags', 'users']),
    );
    expect(tables).not.toContain('otp_requests');
    expect(await migrate(db)).toEqual([]);
    await db.close();
  });
});
