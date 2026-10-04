export type Gender = 'Male' | 'Female';
export type GenderFocus = 'All' | 'Female' | 'Male';
export type Level = 'State' | 'Central' | 'State & Central';
export type Scope = 'Individual' | 'Family';
export type SchemeStatus = 'active' | 'inactive';
export type ReviewStatus = 'ok' | 'needs_review';

/** A single eligibility test. A scheme is eligible when ALL its conditions pass. */
export type Condition =
  | { field: 'age'; op: '>=' | '<='; value: number }
  | { field: 'income'; op: '<='; value: number }
  | { field: 'gender'; op: '=='; value: Gender }
  | { field: 'category' | 'beneficiary' | 'education'; op: 'in'; value: string[] };

export interface Scheme {
  id: string;
  state: string;
  name: string;
  sector: string;
  level: Level;
  scope: Scope;
  genderFocus: GenderFocus;
  ageMin: number | null;
  /** null means "no upper limit" (the Excel value 120 is stored as null). */
  ageMax: number | null;
  castes: string[];
  beneficiaries: string[];
  incomeMax: number | null;
  education: string[];
  residence: string;
  channel: string;
  url: string;
  description: string;
  descriptionHi: string;
  status: SchemeStatus;
  /** ISO date (YYYY-MM-DD) or null when never verified. */
  lastVerified: string | null;
  sourceNote: string;
  reviewStatus: ReviewStatus;
  /** Tags without the leading "#", for example "delhi", "student". */
  tags: string[];
  conditions: Condition[];
}

/** What a person (or family member) tells the portal. */
export interface UserProfile {
  state: string;
  age: number;
  gender: Gender;
  /** Lower bound of the chosen income bracket, see INCOME_BRACKETS. */
  income: number;
  category: string;
  minority: boolean;
  education: string;
  occupation: string;
  /** Extra groups the person ticked: disability, patient, artisan, homeless. */
  special: string[];
}

/** The values the rule engine tests conditions against. */
export interface Facts {
  age: number;
  gender: Gender;
  income: number;
  category: string[];
  beneficiary: string[];
  education: string;
}

/** The raw (string-valued) row of the Excel template, keyed by header. */
export type RawRow = Record<string, unknown>;

export interface RowIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  scheme: Scheme | null;
  errors: RowIssue[];
  warnings: RowIssue[];
}
