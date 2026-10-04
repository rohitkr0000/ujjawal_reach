import { COMING_SOON_STATES, STATES, STATE_META } from '@ujjwal/schemes';

/** Base URL of the API. Empty means "no backend": the portal still works from the static scheme files. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export const HELPLINE = '9034317029';

/** Open states, taken from the shared state list. */
export const ACTIVE_STATES = STATES.map((name) => ({ name, ...STATE_META[name] }));

export const LOCKED_STATES = [...COMING_SOON_STATES, { name: 'Other State', code: 'OT' }] as const;
