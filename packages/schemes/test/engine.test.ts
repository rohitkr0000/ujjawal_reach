import { describe, expect, it } from 'vitest';
import {
  deriveFacts,
  evaluateConditions,
  isEligible,
  matchSchemes,
  validateRow,
  type RawRow,
  type Scheme,
  type UserProfile,
} from '../src';

const person = (over: Partial<UserProfile> = {}): UserProfile => ({
  state: 'Delhi',
  age: 30,
  gender: 'Male',
  income: 0,
  category: 'General',
  minority: false,
  education: 'Graduate',
  occupation: 'Salaried',
  special: [],
  ...over,
});

const make = (over: RawRow): Scheme => {
  const r = validateRow({
    Scheme_ID: 'T-001',
    State: 'Delhi',
    'Scheme Name': 'Test scheme',
    Level: 'State',
    Application_URL: 'https://example.gov.in/',
    ...over,
  });
  if (!r.scheme) throw new Error(JSON.stringify(r.errors));
  return r.scheme;
};

describe('deriveFacts', () => {
  it('adds groups from age, gender and occupation', () => {
    const f = deriveFacts(person({ age: 65, gender: 'Female', occupation: 'Farmer' }));
    expect(f.beneficiary).toEqual(
      expect.arrayContaining(['Senior Citizen', 'Woman', 'Farmer', 'Household', 'General Public']),
    );
    expect(f.beneficiary).not.toContain('Child');
  });
  it('treats under 18 as a child and Business as entrepreneur and vendor', () => {
    expect(deriveFacts(person({ age: 10 })).beneficiary).toContain('Child');
    const b = deriveFacts(person({ occupation: 'Business' })).beneficiary;
    expect(b).toEqual(expect.arrayContaining(['Entrepreneur', 'Vendor']));
  });
  it('adds Minority to the caste facts only when ticked', () => {
    expect(deriveFacts(person({ category: 'OBC' })).category).toEqual(['OBC']);
    expect(deriveFacts(person({ category: 'OBC', minority: true })).category).toEqual([
      'OBC',
      'Minority',
    ]);
  });
  it('adds ticked special groups', () => {
    expect(deriveFacts(person({ special: ['Patient'] })).beneficiary).toContain('Patient');
  });
});

describe('conditions', () => {
  it('age bounds are inclusive', () => {
    const s = make({ Age_Min: 18, Age_Max: 29 });
    expect(isEligible(s, person({ age: 17 }))).toBe(false);
    expect(isEligible(s, person({ age: 18 }))).toBe(true);
    expect(isEligible(s, person({ age: 29 }))).toBe(true);
    expect(isEligible(s, person({ age: 30 }))).toBe(false);
  });
  it('Age_Max 120 means no upper limit', () => {
    const s = make({ Age_Min: 18, Age_Max: 120 });
    expect(s.ageMax).toBeNull();
    expect(isEligible(s, person({ age: 99 }))).toBe(true);
  });
  it('income uses the bracket lower bound', () => {
    const s = make({ Income_Max: 250000 });
    expect(isEligible(s, person({ income: 250000 }))).toBe(true);
    expect(isEligible(s, person({ income: 300001 }))).toBe(false);
  });
  it('gender focus', () => {
    const s = make({ Gender_Focus: 'Female' });
    expect(isEligible(s, person({ gender: 'Male' }))).toBe(false);
    expect(isEligible(s, person({ gender: 'Female' }))).toBe(true);
  });
  it('caste list is OR inside the list', () => {
    const s = make({ Caste_Category: 'SC, ST' });
    expect(isEligible(s, person({ category: 'ST' }))).toBe(true);
    expect(isEligible(s, person({ category: 'OBC' }))).toBe(false);
    const m = make({ Caste_Category: 'Minority' });
    expect(isEligible(m, person({ category: 'General', minority: true }))).toBe(true);
    expect(isEligible(m, person({ category: 'General' }))).toBe(false);
  });
  it('beneficiary and education lists', () => {
    const s = make({
      Beneficiary_Type: 'Student, Farmer',
      Education_Levels: 'Graduate, Post Graduate',
    });
    expect(isEligible(s, person({ occupation: 'Farmer' }))).toBe(true);
    expect(isEligible(s, person({ occupation: 'Salaried' }))).toBe(false);
    expect(isEligible(s, person({ occupation: 'Farmer', education: 'Primary' }))).toBe(false);
  });
  it('all conditions must pass (AND between columns)', () => {
    const s = make({ Age_Min: 60, Gender_Focus: 'Female', Income_Max: 100000 });
    expect(isEligible(s, person({ age: 61, gender: 'Female', income: 0 }))).toBe(true);
    expect(isEligible(s, person({ age: 61, gender: 'Female', income: 250000 }))).toBe(false);
  });
  it('a scheme with no rules matches everyone', () => {
    expect(evaluateConditions([], deriveFacts(person()))).toBe(true);
  });
});

describe('visibility', () => {
  it('only shows active, reviewed schemes of the chosen state', () => {
    const base = { Age_Min: 0 };
    expect(isEligible(make({ ...base, Status: 'inactive' }), person())).toBe(false);
    expect(isEligible(make({ ...base, Source_Note: 'Needs review: unclear' }), person())).toBe(
      false,
    );
    expect(isEligible(make(base), person({ state: 'Madhya Pradesh' }))).toBe(false);
    expect(isEligible(make(base), person())).toBe(true);
  });
});

describe('matchSchemes', () => {
  const family = make({ Scope: 'Family', Income_Max: 300000, Beneficiary_Type: 'Household' });
  const senior = make({ Scheme_ID: 'T-002', Age_Min: 60 });
  it('shows a family scheme once and individual schemes per person', () => {
    const r = matchSchemes([family, senior], [person({ age: 70 }), person({ age: 20 })]);
    expect(r.household.map((s) => s.id)).toEqual(['T-001']);
    expect(r.perPerson[0]!.map((s) => s.id)).toEqual(['T-002']);
    expect(r.perPerson[1]).toEqual([]);
  });
  it('hides the family scheme when nobody matches', () => {
    const r = matchSchemes([family], [person({ income: 300001 })]);
    expect(r.household).toEqual([]);
  });
});
