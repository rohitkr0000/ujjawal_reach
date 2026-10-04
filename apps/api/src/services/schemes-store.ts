import {
  STATE_SLUGS,
  autoTags,
  toPublicSchemes,
  type PublicSchemesFile,
  type Scheme,
} from '@ujjwal/schemes';
import type { Db } from '../db';
import { sha256 } from '../lib/crypto';

/** Convert a database row of the schemes table to a Scheme. */
export function rowToScheme(r: any): Scheme {
  return {
    id: r.id,
    state: r.state,
    name: r.name,
    sector: r.sector,
    level: r.level,
    scope: r.scope,
    genderFocus: r.gender_focus,
    ageMin: r.age_min,
    ageMax: r.age_max,
    castes: r.castes ?? [],
    beneficiaries: r.beneficiaries ?? [],
    incomeMax: r.income_max,
    education: r.education ?? [],
    residence: r.residence,
    channel: r.channel,
    url: r.url,
    description: r.description,
    descriptionHi: r.description_hi,
    status: r.status,
    lastVerified: r.last_verified ?? null,
    sourceNote: r.source_note,
    reviewStatus: r.review_status,
    tags: r.tags ?? [],
    conditions: r.conditions ?? [],
  };
}

const j = (v: unknown) => JSON.stringify(v ?? null);

/** Insert or update a scheme and keep the tag tables in step. */
export async function upsertScheme(db: Db, s: Scheme, adminId: string | null): Promise<void> {
  await db.query(
    `INSERT INTO schemes (id, state, name, sector, level, scope, gender_focus, age_min, age_max, castes,
        beneficiaries, income_max, education, residence, channel, url, description, description_hi, status,
        last_verified, source_note, review_status, tags, conditions, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,
        $23::jsonb,$24::jsonb,$25)
     ON CONFLICT (id) DO UPDATE SET
        state=EXCLUDED.state, name=EXCLUDED.name, sector=EXCLUDED.sector, level=EXCLUDED.level,
        scope=EXCLUDED.scope, gender_focus=EXCLUDED.gender_focus, age_min=EXCLUDED.age_min,
        age_max=EXCLUDED.age_max, castes=EXCLUDED.castes, beneficiaries=EXCLUDED.beneficiaries,
        income_max=EXCLUDED.income_max, education=EXCLUDED.education, residence=EXCLUDED.residence,
        channel=EXCLUDED.channel, url=EXCLUDED.url, description=EXCLUDED.description,
        description_hi=EXCLUDED.description_hi, status=EXCLUDED.status, last_verified=EXCLUDED.last_verified,
        source_note=EXCLUDED.source_note, review_status=EXCLUDED.review_status, tags=EXCLUDED.tags,
        conditions=EXCLUDED.conditions, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [
      s.id, s.state, s.name, s.sector, s.level, s.scope, s.genderFocus, s.ageMin, s.ageMax, j(s.castes),
      j(s.beneficiaries), s.incomeMax, j(s.education), s.residence, s.channel, s.url, s.description,
      s.descriptionHi, s.status, s.lastVerified, s.sourceNote, s.reviewStatus, j(s.tags), j(s.conditions), adminId,
    ],
  );

  const auto = new Set(autoTags(s));
  await db.query(`DELETE FROM scheme_tags WHERE scheme_id = $1`, [s.id]);
  for (const tag of s.tags) {
    await db.query(`INSERT INTO tags (tag, kind) VALUES ($1, $2) ON CONFLICT (tag) DO NOTHING`, [tag, auto.has(tag) ? 'auto' : 'admin']);
    await db.query(`INSERT INTO scheme_tags (scheme_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [s.id, tag]);
  }
}

export async function deleteScheme(db: Db, id: string): Promise<void> {
  await db.query(`DELETE FROM schemes WHERE id = $1`, [id]);
}

export async function getScheme(db: Db, id: string): Promise<Scheme | null> {
  const { rows } = await db.query(`SELECT * FROM schemes WHERE id = $1`, [id]);
  return rows[0] ? rowToScheme(rows[0]) : null;
}

export async function getSchemesByIds(db: Db, ids: string[]): Promise<Map<string, Scheme>> {
  const out = new Map<string, Scheme>();
  if (ids.length === 0) return out;
  const { rows } = await db.query(
    `SELECT * FROM schemes WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))`,
    [JSON.stringify(ids)],
  );
  for (const r of rows) out.set(r.id, rowToScheme(r));
  return out;
}

export const stateFromSlug = (slug: string): string | null =>
  Object.entries(STATE_SLUGS).find(([, s]) => s === slug)?.[0] ?? null;

export interface Published {
  body: string;
  etag: string;
  version: number;
}

/** Builds, stores and serves the public scheme file of each state. */
export class SchemeStore {
  private cache = new Map<string, Published>();
  private tagCache = new Map<string, string[]>();

  constructor(private db: Db) {}

  /** Rebuild the public file of a state from the schemes table. Call after every change. */
  async publish(state: string): Promise<Published> {
    const { rows } = await this.db.query(
      `SELECT * FROM schemes WHERE state = $1 AND status = 'active' AND review_status = 'ok' ORDER BY id`,
      [state],
    );
    const prev = await this.db.query<{ version: number }>(`SELECT version FROM published_schemes WHERE state = $1`, [state]);
    const version = (prev.rows[0]?.version ?? 0) + 1;
    const file: PublicSchemesFile = {
      state,
      version,
      generatedAt: new Date().toISOString(),
      schemes: toPublicSchemes(rows.map(rowToScheme)),
    };
    const body = JSON.stringify(file);
    const etag = `"${sha256(body).slice(0, 32)}"`;
    await this.db.query(
      `INSERT INTO published_schemes (state, version, etag, body) VALUES ($1,$2,$3,$4)
       ON CONFLICT (state) DO UPDATE SET version=EXCLUDED.version, etag=EXCLUDED.etag, body=EXCLUDED.body, built_at=now()`,
      [state, version, etag, body],
    );
    const p = { body, etag, version };
    this.cache.set(state, p);
    this.tagCache.clear();
    return p;
  }

  async getPublished(state: string): Promise<Published> {
    const hit = this.cache.get(state);
    if (hit) return hit;
    const { rows } = await this.db.query<{ body: string; etag: string; version: number }>(
      `SELECT body, etag, version FROM published_schemes WHERE state = $1`,
      [state],
    );
    const row = rows[0];
    if (row) {
      this.cache.set(state, row);
      return row;
    }
    return this.publish(state);
  }

  /** Tags of a scheme, cached. Used to stamp events with the scheme's tags. */
  async tagsOf(schemeId: string): Promise<string[] | null> {
    const hit = this.tagCache.get(schemeId);
    if (hit) return hit;
    const { rows } = await this.db.query<{ tags: string[] }>(`SELECT tags FROM schemes WHERE id = $1`, [schemeId]);
    if (!rows[0]) return null;
    this.tagCache.set(schemeId, rows[0].tags ?? []);
    return rows[0].tags ?? [];
  }

  invalidate(): void {
    this.cache.clear();
    this.tagCache.clear();
  }
}
