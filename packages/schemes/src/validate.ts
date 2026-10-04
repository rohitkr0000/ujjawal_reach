import {
  BENEFICIARIES,
  CASTES,
  CHANNELS,
  EDUCATION_LEVELS,
  GENDER_FOCUS,
  LEVELS,
  RESIDENCE_TYPES,
  SCOPES,
  STATES,
  STATUSES,
} from './constants';
import { autoTags, normalizeTag, splitTags } from './tags';
import type {
  Condition,
  GenderFocus,
  Level,
  RawRow,
  RowIssue,
  Scheme,
  Scope,
  ValidationResult,
} from './types';

/** Convert a raw cell value to trimmed text. Dates become YYYY-MM-DD. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

const FORMULA_START = /^[=+\-@]/;

function pickOne<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T | null,
  field: string,
  errors: RowIssue[],
): T | null {
  if (!value) return fallback;
  const hit = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
  if (hit) return hit;
  errors.push({ field, message: `"${value}" is not allowed. Use one of: ${allowed.join(', ')}` });
  return null;
}

function pickMany<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
  errors: RowIssue[],
): T[] {
  if (!value) return [];
  const out: T[] = [];
  for (const part of value.split(/[,;]/)) {
    const p = part.trim();
    if (!p) continue;
    const hit = allowed.find((a) => a.toLowerCase() === p.toLowerCase());
    if (hit) {
      if (!out.includes(hit)) out.push(hit);
    } else {
      errors.push({ field, message: `"${p}" is not allowed. Use values from: ${allowed.join(', ')}` });
    }
  }
  // Keep the order of the allowed list so the same scheme always produces the same data.
  return allowed.filter((a) => out.includes(a));
}

function parseInteger(
  value: string,
  field: string,
  min: number,
  max: number,
  errors: RowIssue[],
): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    errors.push({ field, message: `"${value}" must be a whole number between ${min} and ${max}` });
    return null;
  }
  return n;
}

function parseDate(value: string, errors: RowIssue[]): string | null {
  if (!value) return null;
  let iso: string | null = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (m) iso = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  else {
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
    if (m) iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  if (iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) return iso;
  }
  errors.push({ field: 'Last_Verified_Date', message: `"${value}" is not a valid date (use YYYY-MM-DD)` });
  return null;
}

function parseUrl(value: string, errors: RowIssue[]): string {
  if (!value) {
    errors.push({ field: 'Application_URL', message: 'Required' });
    return '';
  }
  if (value.length > 500) {
    errors.push({ field: 'Application_URL', message: 'Link is longer than 500 characters' });
    return '';
  }
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
    return u.toString();
  } catch {
    errors.push({ field: 'Application_URL', message: `"${value}" is not a valid http/https link` });
    return '';
  }
}

function text(
  raw: RawRow,
  header: string,
  maxLen: number,
  errors: RowIssue[],
  required = false,
): string {
  const v = cellText(raw[header]);
  if (!v) {
    if (required) errors.push({ field: header, message: 'Required' });
    return '';
  }
  if (FORMULA_START.test(v)) {
    errors.push({ field: header, message: 'Text must not start with = + - or @' });
    return '';
  }
  if (v.length > maxLen) {
    errors.push({ field: header, message: `Longer than ${maxLen} characters` });
    return v.slice(0, maxLen);
  }
  return v;
}

/** Turn the scheme's columns into the list of conditions the rule engine tests. */
export function buildConditions(
  s: Pick<
    Scheme,
    'ageMin' | 'ageMax' | 'genderFocus' | 'castes' | 'beneficiaries' | 'incomeMax' | 'education'
  >,
): Condition[] {
  const c: Condition[] = [];
  if (s.ageMin !== null && s.ageMin > 0) c.push({ field: 'age', op: '>=', value: s.ageMin });
  if (s.ageMax !== null) c.push({ field: 'age', op: '<=', value: s.ageMax });
  if (s.genderFocus === 'Female') c.push({ field: 'gender', op: '==', value: 'Female' });
  if (s.genderFocus === 'Male') c.push({ field: 'gender', op: '==', value: 'Male' });
  if (s.castes.length) c.push({ field: 'category', op: 'in', value: [...s.castes] });
  if (s.beneficiaries.length) c.push({ field: 'beneficiary', op: 'in', value: [...s.beneficiaries] });
  if (s.incomeMax !== null) c.push({ field: 'income', op: '<=', value: s.incomeMax });
  if (s.education.length) c.push({ field: 'education', op: 'in', value: [...s.education] });
  return c;
}

/** Validate one row of the Excel template and build the scheme. Nothing is guessed. */
export function validateRow(raw: RawRow): ValidationResult {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  const id = cellText(raw['Scheme_ID']);
  if (!id) errors.push({ field: 'Scheme_ID', message: 'Required' });
  else if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(id))
    errors.push({ field: 'Scheme_ID', message: 'Use letters, numbers, - or _ (2 to 32 characters)' });

  const state = pickOne(cellText(raw['State']), STATES, null, 'State', errors);
  if (!cellText(raw['State'])) errors.push({ field: 'State', message: 'Required' });
  const name = text(raw, 'Scheme Name', 200, errors, true);
  const sector = text(raw, 'Category / Sector', 120, errors);
  const level = pickOne<Level>(cellText(raw['Level']), LEVELS, null, 'Level', errors);
  if (!cellText(raw['Level'])) errors.push({ field: 'Level', message: 'Required' });
  const scope = pickOne<Scope>(cellText(raw['Scope']), SCOPES, 'Individual', 'Scope', errors);
  const genderFocus = pickOne<GenderFocus>(
    cellText(raw['Gender_Focus']),
    GENDER_FOCUS,
    'All',
    'Gender_Focus',
    errors,
  );

  const ageMin = parseInteger(cellText(raw['Age_Min']), 'Age_Min', 0, 120, errors);
  let ageMax = parseInteger(cellText(raw['Age_Max']), 'Age_Max', 0, 120, errors);
  if (ageMin !== null && ageMax !== null && ageMin > ageMax)
    errors.push({ field: 'Age_Min', message: 'Age_Min is greater than Age_Max' });
  if (ageMax !== null && ageMax >= 120) ageMax = null;

  const castes = pickMany(cellText(raw['Caste_Category']), CASTES, 'Caste_Category', errors);
  const beneficiaries = pickMany(
    cellText(raw['Beneficiary_Type']),
    BENEFICIARIES,
    'Beneficiary_Type',
    errors,
  );
  const incomeText = cellText(raw['Income_Max']);
  let incomeMax: number | null = null;
  if (incomeText) {
    const n = Number(incomeText.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) errors.push({ field: 'Income_Max', message: `"${incomeText}" must be a number of rupees` });
    else incomeMax = Math.round(n);
  }
  const education = pickMany(cellText(raw['Education_Levels']), EDUCATION_LEVELS, 'Education_Levels', errors);
  const residence = pickOne(cellText(raw['Residence_Type']), RESIDENCE_TYPES, 'Any', 'Residence_Type', errors);
  const channel = pickOne(cellText(raw['Application_Channel']), CHANNELS, 'Other', 'Application_Channel', errors);
  const url = parseUrl(cellText(raw['Application_URL']), errors);
  const description = text(raw, 'Description', 1000, errors);
  const descriptionHi = text(raw, 'Description_Hindi', 1000, errors);
  const status = pickOne(cellText(raw['Status']), STATUSES, 'active', 'Status', errors);
  const lastVerified = parseDate(cellText(raw['Last_Verified_Date']), errors);
  const sourceNote = text(raw, 'Source_Note', 500, errors);

  const adminTags: string[] = [];
  for (const t of splitTags(cellText(raw['Tags']))) {
    const n = normalizeTag(t);
    if (!n)
      errors.push({
        field: 'Tags',
        message: `"${t}" is not a valid tag (lower case letters, numbers and -, up to 30 characters)`,
      });
    else if (!adminTags.includes(n)) adminTags.push(n);
  }

  if (!description) warnings.push({ field: 'Description', message: 'No description' });
  if (!lastVerified) warnings.push({ field: 'Last_Verified_Date', message: 'Not verified yet' });

  if (errors.length || !id || !state || !name || !level || !scope || !genderFocus || !residence || !channel || !status) {
    return { scheme: null, errors, warnings };
  }

  const base = {
    id,
    state,
    name,
    sector,
    level,
    scope,
    genderFocus,
    ageMin: ageMin !== null && ageMin > 0 ? ageMin : null,
    ageMax,
    castes,
    beneficiaries,
    incomeMax,
    education,
    residence,
    channel,
    url,
    description,
    descriptionHi,
    status,
    lastVerified,
    sourceNote,
  };
  const tags = [...new Set([...autoTags(base), ...adminTags])];
  const reviewStatus = /needs[\s_-]*review/i.test(sourceNote) ? 'needs_review' : 'ok';
  const scheme: Scheme = { ...base, reviewStatus, tags, conditions: buildConditions(base) };
  return { scheme, errors, warnings };
}

/** Stable text form of a scheme, used to tell "Updated" from "Unchanged" on import. */
export function schemeFingerprint(s: Scheme): string {
  const { conditions: _c, ...rest } = s;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(rest).sort()) {
    const v = (rest as Record<string, unknown>)[k];
    sorted[k] = Array.isArray(v) ? [...v].sort() : v;
  }
  return JSON.stringify(sorted);
}
