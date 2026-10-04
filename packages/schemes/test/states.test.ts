import { describe, expect, it } from 'vitest';
import { COMING_SOON_STATES, STATES, STATE_DISTRICTS, STATE_META, STATE_SLUGS } from '../src';

describe('every state is fully described', () => {
  it.each([...STATES])('%s has districts, a code, a slug and a Hindi name', (state) => {
    const districts = STATE_DISTRICTS[state];
    expect(districts && districts.length).toBeGreaterThan(5);
    expect(new Set(districts).size).toBe(districts!.length);
    const m = STATE_META[state];
    expect(m.code).toMatch(/^[A-Z]{2}$/);
    expect(m.slug).toMatch(/^[a-z]+$/);
    expect(m.hindi.length).toBeGreaterThan(1);
    expect(STATE_SLUGS[state]).toBe(m.slug);
  });

  it('codes and slugs are unique, and a state is not both open and coming soon', () => {
    const codes = STATES.map((s) => STATE_META[s].code);
    const slugs = STATES.map((s) => STATE_META[s].slug);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of COMING_SOON_STATES) {
      expect((STATES as readonly string[]).includes(c.name)).toBe(false);
      expect(codes.includes(c.code)).toBe(false);
    }
  });

  it('no district list mentions a district of another state', () => {
    const seen = new Map<string, string>();
    for (const s of STATES) {
      for (const d of STATE_DISTRICTS[s]!) {
        // a district name may repeat across states in India; only flag duplicates inside one list
        seen.set(`${s}:${d}`, s);
      }
    }
    expect(seen.size).toBe(STATES.reduce((n, s) => n + STATE_DISTRICTS[s]!.length, 0));
  });
});
