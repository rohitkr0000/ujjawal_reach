import { STATE_SLUGS } from './constants';
import type { Scheme } from './types';

export const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;

/** "#Student" -> "student". Returns null when the result is not a valid tag. */
export function normalizeTag(input: string): string | null {
  const t = input.trim().replace(/^#+/, '').toLowerCase();
  return TAG_PATTERN.test(t) ? t : null;
}

export function isValidTag(tag: string): boolean {
  return TAG_PATTERN.test(tag);
}

/** Split "#featured #newscheme, campaign-oct2026" into raw tokens. */
export function splitTags(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const SECTOR_RULES: Array<[RegExp, string]> = [
  [/women|widow|child/i, 'womenchild'],
  [/educat|scholar/i, 'education'],
  [/health|medical/i, 'health'],
  [/housing|homeless/i, 'housing'],
  [/food|lpg|civil suppl/i, 'food'],
  [/agri|farmer/i, 'agriculture'],
  [/labou?r|construction/i, 'labour'],
  [/business|msme|vendor|artisan|industr/i, 'business'],
  [/disab|divyang/i, 'disability'],
  [/senior|social assist/i, 'seniors'],
  [/electric|solar/i, 'electricity'],
];

const BENEFICIARY_TAGS: Record<string, string> = {
  Student: 'student',
  Farmer: 'farmer',
  Worker: 'worker',
  'Senior Citizen': 'seniorcitizen',
  Woman: 'woman',
  Child: 'child',
  'Person with Disability': 'pwd',
  Entrepreneur: 'entrepreneur',
  Vendor: 'vendor',
  Artisan: 'artisan',
  Patient: 'patient',
  Household: 'household',
  'Homeless / Urban Poor': 'urbanpoor',
  Unemployed: 'unemployed',
  'General Public': 'generalpublic',
};

const CHANNEL_TAGS: Record<string, string> = {
  'e-District': 'edistrict',
  'Online Portal': 'onlineportal',
  Bank: 'bank',
  'Hospital / Health Centre': 'hospital',
  'School / College': 'institution',
  Helpline: 'helpline',
  'Department / Office': 'department',
  Other: 'otherchannel',
};

export function sectorTags(sector: string): string[] {
  const out = SECTOR_RULES.filter(([re]) => re.test(sector)).map(([, tag]) => tag);
  return out.length ? out : ['othersector'];
}

/**
 * Tags that are worked out from the scheme's own columns. Admin tags typed in the Excel "Tags"
 * column are added on top of these by the validator.
 */
export function autoTags(
  s: Pick<
    Scheme,
    'state' | 'level' | 'sector' | 'beneficiaries' | 'castes' | 'ageMin' | 'ageMax' | 'channel'
  >,
): string[] {
  const tags = new Set<string>();
  tags.add(STATE_SLUGS[s.state] ?? s.state.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (s.level === 'State' || s.level === 'State & Central') tags.add('statescheme');
  if (s.level === 'Central' || s.level === 'State & Central') tags.add('central');
  for (const t of sectorTags(s.sector)) tags.add(t);
  for (const b of s.beneficiaries) {
    const t = BENEFICIARY_TAGS[b];
    if (t) tags.add(t);
  }
  for (const c of s.castes) tags.add(c.toLowerCase());
  if (s.ageMax !== null && s.ageMax <= 18) tags.add('child');
  else if (s.ageMin !== null && s.ageMin >= 60) tags.add('senior');
  else tags.add('adult');
  const ch = CHANNEL_TAGS[s.channel];
  if (ch) tags.add(ch);
  return [...tags];
}
