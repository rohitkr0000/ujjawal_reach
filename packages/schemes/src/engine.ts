import type { Condition, Facts, Gender, ReviewStatus, Scope, SchemeStatus, UserProfile } from './types';

/** Anything with the fields the matcher needs. Both Scheme and PublicScheme fit. */
export interface Matchable {
  state: string;
  scope: Scope;
  conditions: Condition[];
  status?: SchemeStatus;
  reviewStatus?: ReviewStatus;
}

/** Work out the values the conditions are tested against from what the person entered. */
export function deriveFacts(p: UserProfile): Facts {
  const beneficiary = new Set<string>(['Household', 'General Public']);
  if (p.age >= 60) beneficiary.add('Senior Citizen');
  if (p.age < 18) beneficiary.add('Child');
  if (p.gender === 'Female') beneficiary.add('Woman');
  switch (p.occupation) {
    case 'Student':
      beneficiary.add('Student');
      break;
    case 'Farmer':
      beneficiary.add('Farmer');
      break;
    case 'Worker':
    case 'Daily Wages':
      beneficiary.add('Worker');
      break;
    case 'Business':
      beneficiary.add('Entrepreneur');
      beneficiary.add('Vendor');
      break;
    case 'Unemployed':
      beneficiary.add('Unemployed');
      break;
    default:
      break;
  }
  for (const s of p.special) beneficiary.add(s);

  const category = [p.category];
  if (p.minority) category.push('Minority');

  return {
    age: p.age,
    gender: p.gender,
    income: p.income,
    category,
    beneficiary: [...beneficiary],
    education: p.education,
  };
}

export function checkCondition(c: Condition, f: Facts): boolean {
  switch (c.field) {
    case 'age':
      return c.op === '>=' ? f.age >= c.value : f.age <= c.value;
    case 'income':
      return f.income <= c.value;
    case 'gender':
      return f.gender === (c.value as Gender);
    case 'category':
      return c.value.some((v) => f.category.includes(v));
    case 'beneficiary':
      return c.value.some((v) => f.beneficiary.includes(v));
    case 'education':
      return c.value.includes(f.education);
  }
}

/** True when every condition passes. A scheme with no conditions matches everyone. */
export function evaluateConditions(conditions: Condition[], facts: Facts): boolean {
  return conditions.every((c) => checkCondition(c, facts));
}

/** Only active, reviewed schemes of the person's state can ever be shown to a user. */
export function isVisible(s: Matchable, state: string): boolean {
  return (
    s.state === state && (s.status ?? 'active') === 'active' && (s.reviewStatus ?? 'ok') === 'ok'
  );
}

export function isEligible(s: Matchable, profile: UserProfile): boolean {
  return isVisible(s, profile.state) && evaluateConditions(s.conditions, deriveFacts(profile));
}

export interface MatchResult<T> {
  /** Family-scope schemes: shown once when at least one person matches. */
  household: T[];
  /** Individual-scope schemes for each person, in the same order as the input profiles. */
  perPerson: T[][];
}

export function matchSchemes<T extends Matchable>(
  schemes: T[],
  profiles: UserProfile[],
): MatchResult<T> {
  const household: T[] = [];
  const perPerson: T[][] = profiles.map(() => []);
  for (const s of schemes) {
    if (s.scope === 'Family') {
      if (profiles.some((p) => isEligible(s, p))) household.push(s);
    } else {
      profiles.forEach((p, i) => {
        if (isEligible(s, p)) perPerson[i]!.push(s);
      });
    }
  }
  return { household, perPerson };
}
