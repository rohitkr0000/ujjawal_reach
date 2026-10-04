import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The tracker talks to browser globals, so give it small stand-ins before it is loaded.
const store = new Map<string, string>();
const listeners: Record<string, Array<() => void>> = { visibilitychange: [], pagehide: [] };
const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];

let tracking: typeof import('../lib/tracking');

beforeAll(async () => {
  process.env['NEXT_PUBLIC_API_URL'] = 'http://api.test';
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: true }),
    addEventListener: (e: string, f: () => void) => listeners[e]?.push(f),
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (e: string, f: () => void) => listeners[e]?.push(f),
  });
  vi.stubGlobal('fetch', async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: true };
  });
  tracking = await import('../lib/tracking');
});

beforeEach(() => {
  calls.length = 0;
  store.clear();
});

describe('browser tracking', () => {
  it('records nothing until the visitor allows it', async () => {
    tracking.track('page_view');
    await tracking.flush();
    expect(calls).toHaveLength(0);
    tracking.setConsent('denied');
    tracking.track('page_view');
    await tracking.flush();
    expect(calls).toHaveLength(0);
  });

  it('batches events and sends them as text/plain (no CORS preflight)', async () => {
    tracking.setConsent('granted');
    tracking.track('page_view');
    tracking.track('state_selected', { state: 'Delhi' });
    expect(calls).toHaveLength(0); // waiting for the timer
    await tracking.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://api.test/events');
    expect(calls[0]!.headers['content-type']).toBe('text/plain');
    expect(calls[0]!.body).toMatchObject({ consent: true, device: 'mobile' });
    expect(calls[0]!.body.events.map((e: any) => e.type)).toEqual(['page_view', 'state_selected']);
    expect(calls[0]!.body.sessionId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('sends a click on an official link straight away', async () => {
    tracking.setConsent('granted');
    tracking.track('scheme_clicked', { schemeId: 'DEL-001', state: 'Delhi' });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.events[0]).toMatchObject({ type: 'scheme_clicked', schemeId: 'DEL-001' });
  });

  it('sends what is waiting when the page is hidden or closed', async () => {
    tracking.setConsent('granted');
    tracking.track('scheme_shown', { schemeId: 'DEL-002', state: 'Delhi' });
    expect(calls).toHaveLength(0);
    (document as any).visibilityState = 'hidden';
    listeners['visibilitychange']!.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);

    tracking.track('scheme_shown', { schemeId: 'DEL-003', state: 'Delhi' });
    listeners['pagehide']!.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(2);
    (document as any).visibilityState = 'visible';
  });

  it('withdrawing consent drops what was queued', async () => {
    tracking.setConsent('granted');
    tracking.track('page_view');
    tracking.setConsent('denied');
    await tracking.flush();
    expect(calls).toHaveLength(0);
  });

  it('uses the same session id within one visit', () => {
    expect(tracking.getSessionId()).toBe(tracking.getSessionId());
  });
});
