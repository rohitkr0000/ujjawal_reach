import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  EDUCATION_LEVELS,
  INCOME_BRACKETS,
  OCCUPATIONS,
  SPECIAL_GROUPS,
  STATES,
  STATE_DISTRICTS,
  looksLikeAadhaar,
} from '@ujjwal/schemes';
import type { AppContext } from '../context';
import { randomCardId, uuid } from '../lib/crypto';
import { conflict } from '../lib/errors';
import { cleanText, parse } from '../lib/validate';
import { limit } from '../plugins/auth';

// There is no login, so a person is identified by the mobile number of the first person on the form.
// The number is NOT verified. A limit per number stops one number being used to fill the database.
const MOBILE_RE = /^[6-9]\d{9}$/;
const MAX_CARDS_PER_USER = 10;
const BRACKETS: number[] = INCOME_BRACKETS.map((b) => b.value);
const CATEGORIES = ['SC', 'ST', 'OBC', 'EWS', 'General'] as const;
const RELATIONS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Other'] as const;

const text = (min: number, max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, 'Required')
        .max(max, `At most ${max} characters`)
        .refine((v) => !looksLikeAadhaar(v), 'Please do not enter an Aadhaar number'),
    );

const incomeSchema = z.number().refine((v) => BRACKETS.includes(v), 'Pick one of the income brackets');

const personSchema = z.object({
  name: text(1, 80),
  relation: z.enum(RELATIONS),
  mobile: z.string().regex(MOBILE_RE, 'Enter a valid 10 digit mobile number'),
  gender: z.enum(['Male', 'Female']),
  age: z.number().int().min(0).max(120),
  education: z.enum(EDUCATION_LEVELS),
  occupation: z.enum(OCCUPATIONS),
  income: incomeSchema,
  category: z.enum(CATEGORIES),
  minority: z.boolean(),
  special: z.array(z.enum(SPECIAL_GROUPS)).max(SPECIAL_GROUPS.length),
});

const registrationSchema = z
  .object({
    mode: z.enum(['personal', 'family']),
    state: z.enum(STATES),
    district: text(1, 80),
    address: z.object({
      house: text(1, 60),
      locality: text(1, 80),
      pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6 digit pincode'),
    }),
    family: z
      .object({
        income: incomeSchema,
        category: z.enum(CATEGORIES),
        minority: z.boolean(),
        residence: z.number().int().min(0).max(120),
      })
      .nullable(),
    people: z.array(personSchema).min(1).max(20),
    consent: z.object({ details: z.literal(true, 'Consent is required'), tracking: z.boolean() }),
    sessionId: z.string().regex(/^[a-z0-9-]{8,64}$/).optional(),
  })
  .superRefine((v, ctx) => {
    if (!(STATE_DISTRICTS[v.state] ?? []).includes(v.district))
      ctx.addIssue({ code: 'custom', path: ['district'], message: 'District does not belong to this state' });
    if (v.mode === 'personal' && v.people.length !== 1)
      ctx.addIssue({ code: 'custom', path: ['people'], message: 'A personal card has exactly one person' });
    if (v.mode === 'family' && !v.family)
      ctx.addIssue({ code: 'custom', path: ['family'], message: 'Family details are required' });
  });

async function uniqueCardId(ctx: AppContext): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const id = randomCardId();
    const { rowCount } = await ctx.db.query(`SELECT 1 FROM registrations WHERE card_id = $1`, [id]);
    if (rowCount === 0) return id;
  }
  throw new Error('Could not create a card id');
}

export function registrationRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * Save a submitted form. Public: no login. The visitor already agreed (consent.details) and the
   * person is found or created from the first person's mobile number.
   */
  app.post('/registrations', limit(ctx, 60), async (req, reply) => {
    const body = parse(registrationSchema, req.body);
    const mobile = body.people[0]!.mobile;
    const upsert = await ctx.db.query<{ id: string }>(
      `INSERT INTO users (id, mobile, last_login_at) VALUES ($1, $2, now())
       ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`,
      [uuid(), mobile],
    );
    const userId = upsert.rows[0]!.id;

    const count = await ctx.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM registrations WHERE user_id = $1`, [userId]);
    if (count.rows[0]!.n >= MAX_CARDS_PER_USER) throw conflict(`You can save at most ${MAX_CARDS_PER_USER} cards`);

    const id = uuid();
    const cardId = await uniqueCardId(ctx);
    const track = body.consent.tracking && !!body.sessionId;
    // Events still waiting in memory belong to this session too: write them first so they get linked.
    if (track) await ctx.events.flush();

    await ctx.db.tx(async (db) => {
      await db.query(
        `INSERT INTO registrations (id, user_id, card_id, mode, state, district, house, locality, pincode, family,
            consent_tracking, session_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
        [
          id, userId, cardId, body.mode, body.state, body.district, body.address.house, body.address.locality,
          body.address.pincode, JSON.stringify(body.family), body.consent.tracking, track ? body.sessionId : null,
        ],
      );
      const values: unknown[] = [];
      const tuples: string[] = [];
      body.people.forEach((p, pos) => {
        const i = values.length;
        values.push(uuid(), id, pos, p.name, p.relation, p.mobile, p.gender, p.age, p.education, p.occupation, p.income, p.category, p.minority, JSON.stringify(p.special));
        tuples.push(`($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10},$${i + 11},$${i + 12},$${i + 13},$${i + 14}::jsonb)`);
      });
      await db.query(
        `INSERT INTO family_members (id, registration_id, position, name, relation, mobile, gender, age, education,
            occupation, income, category, minority, special) VALUES ${tuples.join(',')}`,
        values,
      );
      if (track) {
        // Only with the visitor's consent: attach this browser session's activity to the person.
        await db.query(
          `INSERT INTO session_users (session_id, user_id) VALUES ($1, $2)
           ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = now()`,
          [body.sessionId, userId],
        );
        await db.query(`UPDATE events SET user_id = $1 WHERE session_id = $2 AND user_id IS NULL`, [userId, body.sessionId]);
      }
    });
    return reply.code(201).send({ id, cardId });
  });
}
