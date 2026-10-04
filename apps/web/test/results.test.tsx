import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicSchemesFile } from '@ujjwal/schemes';
import type { SubmitData } from '../components/forms';
import { Results } from '../components/Results';
import { LangProvider } from '../lib/i18n';

const load = (slug: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../public/data/schemes-${slug}.json`), 'utf-8')) as PublicSchemesFile;

const base = {
  state: 'Delhi',
  district: 'West Delhi',
  addressText: '65, Colony, Dist. West Delhi, Delhi - 110059',
  address: { house: '65', locality: 'Colony', pincode: '110059' },
  consentTracking: false,
};

const person = (over = {}) => ({
  name: 'Asha',
  relation: 'Self',
  mobile: '9876543210',
  profile: {
    state: 'Delhi',
    age: 70,
    gender: 'Female' as const,
    income: 0,
    category: 'SC',
    minority: false,
    education: 'None',
    occupation: 'Unemployed',
    special: [],
    ...over,
  },
});

const render = (data: SubmitData, file: PublicSchemesFile) =>
  renderToString(
    <LangProvider>
      <Results data={data} schemes={file} onRestart={() => undefined} />
    </LangProvider>,
  );

describe('published scheme files', () => {
  it.each(['delhi', 'madhyapradesh'])('%s file is well formed and only has visible schemes', (slug) => {
    const f = load(slug);
    expect(f.schemes.length).toBeGreaterThan(10);
    expect(new Set(f.schemes.map((s) => s.id)).size).toBe(f.schemes.length);
    for (const s of f.schemes) {
      expect(s.url).toMatch(/^https?:\/\//);
      expect(s.tags.length).toBeGreaterThan(0);
    }
  });
});

describe('Results', () => {
  it('renders matching schemes for a personal applicant with safe links', () => {
    const file = load('delhi');
    const html = render({ ...base, mode: 'personal', family: null, people: [person()] }, file);
    expect(html).toContain('Schemes for Delhi');
    expect(html).toContain('Delhi Pension Scheme to Women in Distress');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('65, Colony, Dist. West Delhi, Delhi - 110059');
  });

  it('does not show a girl-child scheme to a 70 year old', () => {
    const html = render({ ...base, mode: 'personal', family: null, people: [person()] }, load('delhi'));
    expect(html).not.toContain('Delhi Ladli Scheme');
  });

  it('shows member tabs for a family', () => {
    const data: SubmitData = {
      ...base,
      mode: 'family',
      family: { income: 0, category: 'SC', minority: false },
      people: [person({ age: 40 }), { ...person({ age: 10, gender: 'Female', occupation: 'Student', education: 'Primary' }), name: 'Meena', relation: 'Daughter' }],
    };
    const html = render(data, load('delhi'));
    expect(html).toContain('Asha');
    expect(html).toContain('Meena');
    expect(html).toContain('role="tablist"');
  });

  it('escapes names that contain HTML', () => {
    const p = { ...person(), name: '<img src=x onerror=alert(1)>' };
    const html = render({ ...base, mode: 'family', family: null, people: [p] }, load('delhi'));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('works for Madhya Pradesh', () => {
    const data: SubmitData = {
      ...base,
      state: 'Madhya Pradesh',
      mode: 'personal',
      family: null,
      people: [person({ state: 'Madhya Pradesh', age: 25, occupation: 'Farmer', category: 'OBC' })],
    };
    const html = render(data, load('madhyapradesh'));
    expect(html).toContain('Mukhyamantri Ladli Behna Yojana');
    expect(html).toContain('Mukhyamantri Kisan Kalyan Yojana');
  });
});
