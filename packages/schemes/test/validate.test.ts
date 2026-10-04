import { describe, expect, it } from 'vitest';
import { autoTags, normalizeTag, schemeFingerprint, splitTags, validateRow } from '../src';

const ok = {
  Scheme_ID: 'DEL-001',
  State: 'Delhi',
  'Scheme Name': 'Delhi Ladli Scheme',
  'Category / Sector': 'Women & Child Development',
  Level: 'State',
  Application_URL: 'https://edistrict.delhigovt.nic.in/',
};

describe('validateRow', () => {
  it('accepts a minimal row, fills defaults and warns about missing info', () => {
    const r = validateRow(ok);
    expect(r.errors).toEqual([]);
    expect(r.scheme).toMatchObject({
      scope: 'Individual',
      genderFocus: 'All',
      residence: 'Any',
      channel: 'Other',
      status: 'active',
      reviewStatus: 'ok',
      conditions: [],
    });
    expect(r.warnings.map((w) => w.field)).toEqual(['Description', 'Last_Verified_Date']);
  });

  it.each([
    [{ Scheme_ID: '' }, 'Scheme_ID'],
    [{ Scheme_ID: 'bad id!' }, 'Scheme_ID'],
    [{ State: 'Goa' }, 'State'],
    [{ State: '' }, 'State'],
    [{ 'Scheme Name': '' }, 'Scheme Name'],
    [{ 'Scheme Name': '=HYPERLINK("x")' }, 'Scheme Name'],
    [{ Description: '@SUM(A1)' }, 'Description'],
    [{ Level: 'Local' }, 'Level'],
    [{ Level: '' }, 'Level'],
    [{ Gender_Focus: 'Other' }, 'Gender_Focus'],
    [{ Age_Min: 'abc' }, 'Age_Min'],
    [{ Age_Min: 50, Age_Max: 20 }, 'Age_Min'],
    [{ Age_Max: 200 }, 'Age_Max'],
    [{ Caste_Category: 'SC, XYZ' }, 'Caste_Category'],
    [{ Beneficiary_Type: 'Scheme-specific' }, 'Beneficiary_Type'],
    [{ Education_Levels: 'PhD' }, 'Education_Levels'],
    [{ Income_Max: '-5' }, 'Income_Max'],
    [{ Residence_Type: 'Delhi-linked' }, 'Residence_Type'],
    [{ Application_Channel: 'Fax' }, 'Application_Channel'],
    [{ Application_URL: '' }, 'Application_URL'],
    [{ Application_URL: 'javascript:alert(1)' }, 'Application_URL'],
    [{ Application_URL: 'not a url' }, 'Application_URL'],
    [{ Status: 'maybe' }, 'Status'],
    [{ Last_Verified_Date: '31/02/2026' }, 'Last_Verified_Date'],
    [{ Tags: '#Good #bad_tag' }, 'Tags'],
    [{ Tags: '#' + 'a'.repeat(31) }, 'Tags'],
  ])('rejects %j', (over, field) => {
    const r = validateRow({ ...ok, ...over });
    expect(r.scheme).toBeNull();
    expect(r.errors.map((e) => e.field)).toContain(field);
  });

  it('normalises values and keeps the allowed-list order', () => {
    const r = validateRow({
      ...ok,
      Caste_Category: 'obc, sc',
      Beneficiary_Type: 'farmer;student',
      Age_Min: '18',
      Age_Max: '120',
      Income_Max: '250,000',
      Last_Verified_Date: '05-10-2026',
    });
    expect(r.errors).toEqual([]);
    expect(r.scheme).toMatchObject({
      castes: ['SC', 'OBC'],
      beneficiaries: ['Student', 'Farmer'],
      ageMin: 18,
      ageMax: null,
      incomeMax: 250000,
      lastVerified: '2026-10-05',
    });
  });

  it('marks "needs review" rows and still validates them', () => {
    const r = validateRow({ ...ok, Source_Note: 'Needs review: age unclear' });
    expect(r.scheme?.reviewStatus).toBe('needs_review');
  });

  it('adds admin tags on top of automatic tags', () => {
    const r = validateRow({ ...ok, Tags: '#Featured #campaign-oct2026, #featured' });
    expect(r.scheme?.tags).toEqual(
      expect.arrayContaining(['delhi', 'statescheme', 'womenchild', 'featured', 'campaign-oct2026']),
    );
    expect(r.scheme!.tags.filter((t) => t === 'featured')).toHaveLength(1);
  });

  it('fingerprint is stable and changes when a field changes', () => {
    const a = validateRow(ok).scheme!;
    const b = validateRow({ ...ok }).scheme!;
    const c = validateRow({ ...ok, 'Scheme Name': 'Other' }).scheme!;
    expect(schemeFingerprint(a)).toBe(schemeFingerprint(b));
    expect(schemeFingerprint(a)).not.toBe(schemeFingerprint(c));
  });
});

describe('tags', () => {
  it('normalises and rejects', () => {
    expect(normalizeTag('#Student')).toBe('student');
    expect(normalizeTag(' ##Camp-1 ')).toBe('camp-1');
    expect(normalizeTag('two words')).toBeNull();
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('-start')).toBeNull();
  });
  it('splits on spaces, commas and semicolons', () => {
    expect(splitTags('#a #b,c;d')).toEqual(['#a', '#b', 'c', 'd']);
  });
  it('derives tags from the columns', () => {
    const t = autoTags({
      state: 'Madhya Pradesh',
      level: 'State & Central',
      sector: 'Education & Scholarships',
      beneficiaries: ['Student', 'Person with Disability'],
      castes: ['SC'],
      ageMin: null,
      ageMax: 18,
      channel: 'e-District',
    });
    expect(t).toEqual(
      expect.arrayContaining([
        'madhyapradesh',
        'statescheme',
        'central',
        'education',
        'student',
        'pwd',
        'sc',
        'child',
        'edistrict',
      ]),
    );
  });
});
