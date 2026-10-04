import { autoTags } from './tags';
import type { Scheme } from './types';

/** Remove leading = + - @ so a cell can never be read as a formula by a spreadsheet program. */
export function safeCell(v: string): string {
  return v.replace(/^[=+\-@]+/, '');
}

/** The scheme as a row of the Excel template (header -> value). Used for export and admin editing. */
export function schemeToRawRow(s: Scheme): Record<string, string | number | null> {
  const auto = new Set(autoTags(s));
  const adminTags = s.tags.filter((t) => !auto.has(t));
  return {
    Scheme_ID: safeCell(s.id),
    State: s.state,
    'Scheme Name': safeCell(s.name),
    'Category / Sector': safeCell(s.sector),
    Level: s.level,
    Scope: s.scope,
    Gender_Focus: s.genderFocus,
    Age_Min: s.ageMin,
    Age_Max: s.ageMax,
    Caste_Category: s.castes.join(', '),
    Beneficiary_Type: s.beneficiaries.join(', '),
    Income_Max: s.incomeMax,
    Education_Levels: s.education.join(', '),
    Residence_Type: s.residence,
    Application_Channel: s.channel,
    Application_URL: s.url,
    Description: safeCell(s.description),
    Description_Hindi: safeCell(s.descriptionHi),
    Status: s.status,
    Last_Verified_Date: s.lastVerified,
    Source_Note: safeCell(s.sourceNote),
    Tags: adminTags.map((t) => `#${t}`).join(' '),
  };
}

