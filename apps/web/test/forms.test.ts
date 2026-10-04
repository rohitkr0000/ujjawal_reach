import { describe, expect, it } from 'vitest';
import {
  emptyFamilyRoot,
  emptyMember,
  emptyPersonal,
  formatAddress,
  hasErrors,
  memberToPerson,
  personalToPerson,
  validateFamilyRoot,
  validateMember,
  validatePersonal,
  type PersonalValues,
} from '../lib/forms';

const validPersonal = (): PersonalValues => ({
  ...emptyPersonal(),
  name: 'Asha Devi',
  mobile: '9876543210',
  age: '34',
  income: '100000',
  category: 'OBC',
  education: 'Secondary',
  occupation: 'Daily Wages',
  gender: 'Female',
  house: '65',
  locality: 'Shakti Colony',
  district: 'West Delhi',
  pincode: '110059',
  consentDetails: true,
});

describe('validatePersonal', () => {
  it('accepts a complete form', () => {
    expect(validatePersonal(validPersonal())).toEqual({});
  });
  it('flags every empty required field', () => {
    const e = validatePersonal(emptyPersonal());
    expect(Object.keys(e).sort()).toEqual(
      ['age', 'category', 'consentDetails', 'district', 'education', 'gender', 'house', 'income', 'locality', 'mobile', 'name', 'occupation', 'pincode'].sort(),
    );
  });
  it.each([
    ['mobile', '1234567890', 'errMobile'],
    ['mobile', '98765', 'errMobile'],
    ['pincode', '012345', 'errPincode'],
    ['pincode', '1100', 'errPincode'],
    ['age', '121', 'errAge'],
    ['age', 'abc', 'errAge'],
  ])('rejects %s = %s', (field, value, msg) => {
    const e = validatePersonal({ ...validPersonal(), [field]: value });
    expect(e[field]).toBe(msg);
  });
  it('requires the details consent but not the tracking consent', () => {
    expect(validatePersonal({ ...validPersonal(), consentDetails: false })['consentDetails']).toBe('errConsent');
    expect(hasErrors(validatePersonal({ ...validPersonal(), consentTracking: false }))).toBe(false);
  });
});

describe('family forms', () => {
  it('validates the family root', () => {
    expect(hasErrors(validateFamilyRoot(emptyFamilyRoot()))).toBe(true);
    expect(
      validateFamilyRoot({
        ...emptyFamilyRoot(),
        income: '0',
        category: 'SC',
        house: '1',
        locality: 'x',
        district: 'Indore',
        pincode: '452001',
        consentDetails: true,
      }),
    ).toEqual({});
  });
  it('validates a member', () => {
    expect(Object.keys(validateMember(emptyMember())).sort()).toEqual(['age', 'gender', 'mobile', 'name']);
    expect(validateMember({ ...emptyMember(), name: 'Raju', mobile: '9876543210', age: '8', gender: 'Male' })).toEqual({});
  });
});

describe('profiles', () => {
  it('builds a person profile from the personal form', () => {
    const p = personalToPerson(validPersonal(), 'Delhi');
    expect(p).toMatchObject({
      name: 'Asha Devi',
      relation: 'Self',
      profile: { state: 'Delhi', age: 34, gender: 'Female', income: 100000, category: 'OBC', minority: false },
    });
  });
  it('members share the family income and category', () => {
    const root = { ...emptyFamilyRoot(), income: '250000', category: 'ST', minority: true };
    const p = memberToPerson({ ...emptyMember(), name: ' Raju ', mobile: '9876543210', age: '8', gender: 'Male' }, root, 'Madhya Pradesh');
    expect(p.name).toBe('Raju');
    expect(p.profile).toMatchObject({ state: 'Madhya Pradesh', age: 8, income: 250000, category: 'ST', minority: true });
  });
  it('formats the address', () => {
    expect(formatAddress({ house: ' 65 ', locality: 'Colony', district: 'Indore', pincode: '452001' }, 'Madhya Pradesh')).toBe(
      '65, Colony, Dist. Indore, Madhya Pradesh - 452001',
    );
  });
});
