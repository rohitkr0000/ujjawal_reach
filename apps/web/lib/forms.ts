import { looksLikeAadhaar, type UserProfile } from '@ujjwal/schemes';
import type { TKey } from './i18n';

export interface PersonalValues {
  name: string;
  mobile: string;
  age: string;
  income: string;
  category: string;
  minority: boolean;
  education: string;
  occupation: string;
  gender: string;
  special: string[];
  house: string;
  locality: string;
  district: string;
  pincode: string;
  consentDetails: boolean;
  consentTracking: boolean;
}

export interface FamilyRootValues {
  income: string;
  category: string;
  minority: boolean;
  house: string;
  locality: string;
  district: string;
  pincode: string;
  consentDetails: boolean;
  consentTracking: boolean;
}

export interface MemberValues {
  name: string;
  mobile: string;
  relation: string;
  gender: string;
  age: string;
  education: string;
  occupation: string;
  special: string[];
}

/** One person in the results: the personal applicant or a family member. */
export interface Person {
  name: string;
  relation: string;
  mobile: string;
  profile: UserProfile;
}

export type Errors = Record<string, TKey>;

export const MOBILE_RE = /^[6-9]\d{9}$/;
export const PINCODE_RE = /^[1-9]\d{5}$/;

export const emptyPersonal = (): PersonalValues => ({
  name: '',
  mobile: '',
  age: '',
  income: '',
  category: '',
  minority: false,
  education: '',
  occupation: '',
  gender: '',
  special: [],
  house: '',
  locality: '',
  district: '',
  pincode: '',
  consentDetails: false,
  consentTracking: false,
});

export const emptyFamilyRoot = (): FamilyRootValues => ({
  income: '',
  category: '',
  minority: false,
  house: '',
  locality: '',
  district: '',
  pincode: '',
  consentDetails: false,
  consentTracking: false,
});

export const emptyMember = (): MemberValues => ({
  name: '',
  mobile: '',
  relation: 'Self',
  gender: '',
  age: '',
  education: 'Graduate',
  occupation: 'Salaried',
  special: [],
});

function req(errors: Errors, key: string, value: string) {
  if (!value.trim()) errors[key] = 'errRequired';
  else if (looksLikeAadhaar(value)) errors[key] = 'errAadhaar';
}

function checkAge(errors: Errors, v: string) {
  if (!v.trim()) errors['age'] = 'errRequired';
  else if (!/^\d{1,3}$/.test(v.trim()) || Number(v) > 120) errors['age'] = 'errAge';
}

function checkContact(errors: Errors, mobile: string) {
  if (!mobile.trim()) errors['mobile'] = 'errRequired';
  else if (!MOBILE_RE.test(mobile.trim())) errors['mobile'] = 'errMobile';
}

function checkAddress(errors: Errors, v: { house: string; locality: string; district: string; pincode: string }) {
  req(errors, 'house', v.house);
  req(errors, 'locality', v.locality);
  req(errors, 'district', v.district);
  if (!v.pincode.trim()) errors['pincode'] = 'errRequired';
  else if (!PINCODE_RE.test(v.pincode.trim())) errors['pincode'] = 'errPincode';
}

export function validatePersonal(v: PersonalValues): Errors {
  const e: Errors = {};
  req(e, 'name', v.name);
  checkContact(e, v.mobile);
  checkAge(e, v.age);
  req(e, 'income', v.income);
  req(e, 'category', v.category);
  req(e, 'education', v.education);
  req(e, 'occupation', v.occupation);
  req(e, 'gender', v.gender);
  checkAddress(e, v);
  if (!v.consentDetails) e['consentDetails'] = 'errConsent';
  return e;
}

export function validateFamilyRoot(v: FamilyRootValues): Errors {
  const e: Errors = {};
  req(e, 'income', v.income);
  req(e, 'category', v.category);
  checkAddress(e, v);
  if (!v.consentDetails) e['consentDetails'] = 'errConsent';
  return e;
}

export function validateMember(v: MemberValues): Errors {
  const e: Errors = {};
  req(e, 'name', v.name);
  checkContact(e, v.mobile);
  checkAge(e, v.age);
  req(e, 'gender', v.gender);
  req(e, 'education', v.education);
  req(e, 'occupation', v.occupation);
  return e;
}

export const hasErrors = (e: Errors) => Object.keys(e).length > 0;

export function personalToPerson(v: PersonalValues, state: string): Person {
  return {
    name: v.name.trim(),
    relation: 'Self',
    mobile: v.mobile.trim(),
    profile: {
      state,
      age: Number(v.age),
      gender: v.gender === 'Female' ? 'Female' : 'Male',
      income: Number(v.income),
      category: v.category,
      minority: v.minority,
      education: v.education,
      occupation: v.occupation,
      special: v.special,
    },
  };
}

export function memberToPerson(m: MemberValues, root: FamilyRootValues, state: string): Person {
  return {
    name: m.name.trim(),
    relation: m.relation,
    mobile: m.mobile.trim(),
    profile: {
      state,
      age: Number(m.age),
      gender: m.gender === 'Female' ? 'Female' : 'Male',
      income: Number(root.income),
      category: root.category,
      minority: root.minority,
      education: m.education,
      occupation: m.occupation,
      special: m.special,
    },
  };
}

export function formatAddress(
  v: { house: string; locality: string; district: string; pincode: string },
  state: string,
): string {
  return `${v.house.trim()}, ${v.locality.trim()}, Dist. ${v.district}, ${state} - ${v.pincode.trim()}`;
}
