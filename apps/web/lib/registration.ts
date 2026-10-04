import type { SubmitData } from '../components/forms';
import { getSessionId } from './tracking';

/** The body sent to POST /registrations. The server validates everything again. */
export function buildRegistrationPayload(d: SubmitData) {
  return {
    mode: d.mode,
    state: d.state,
    district: d.district,
    address: d.address,
    family: d.family,
    people: d.people.map((p) => ({
      name: p.name,
      relation: p.relation,
      mobile: p.mobile,
      gender: p.profile.gender,
      age: p.profile.age,
      education: p.profile.education,
      occupation: p.profile.occupation,
      income: p.profile.income,
      category: p.profile.category,
      minority: p.profile.minority,
      special: p.profile.special,
    })),
    consent: { details: true, tracking: d.consentTracking },
    sessionId: getSessionId(),
  };
}

export interface SaveResult {
  id: string;
  cardId: string;
}
