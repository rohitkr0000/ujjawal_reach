import { API_URL } from './config';

export type TrackType =
  | 'page_view'
  | 'state_selected'
  | 'mode_selected'
  | 'form_started'
  | 'form_step_completed'
  | 'form_submitted'
  | 'form_abandoned'
  | 'scheme_shown'
  | 'scheme_clicked';

export interface TrackEvent {
  type: TrackType;
  ts: number;
  state?: string;
  schemeId?: string;
  props?: Record<string, string | number | boolean>;
}

const CONSENT_KEY = 'ur_consent';
const SESSION_KEY = 'ur_session';

export type Consent = 'granted' | 'denied' | null;

export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

/** The form checkbox and the banner both set this. Withdrawing consent also drops queued events. */
export function setConsent(v: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* ignore */
  }
  if (v === 'denied') queue.length = 0;
}

function randomId(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random id for this browser tab session. It is not linked to a person until they register. */
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

const queue: TrackEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const MAX_BATCH = 50;

function device(): 'mobile' | 'desktop' {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
    ? 'mobile'
    : 'desktop';
}

/** Queue an event. Nothing is recorded unless the visitor allowed it. */
export function track(
  type: TrackType,
  data: { state?: string; schemeId?: string; props?: TrackEvent['props'] } = {},
): void {
  if (!API_URL || getConsent() !== 'granted') return;
  queue.push({ type, ts: Date.now(), ...data });
  // A click on an official link is the most valuable event and the visitor may leave straight away.
  if (queue.length >= MAX_BATCH || type === 'scheme_clicked') void flush();
  else if (!timer) timer = setTimeout(() => void flush(), 3000);
}

export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!API_URL || getConsent() !== 'granted' || queue.length === 0) return;
  const events = queue.splice(0, MAX_BATCH);
  try {
    // text/plain keeps this a "simple" request, so the browser does not send a preflight and
    // the request still completes while the page is closing (keepalive).
    await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ consent: true, sessionId: getSessionId(), device: device(), events }),
      keepalive: true,
    });
  } catch {
    /* tracking must never break the page */
  }
  if (queue.length) timer = setTimeout(() => void flush(), 3000);
}

// Send whatever is waiting when the page is hidden or closed (keepalive lets the request finish).
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
}
