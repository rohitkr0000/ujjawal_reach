import { createHash } from 'node:crypto';
import type { Config } from '../config';

const lastSent = new Map<string, number>();
const MIN_GAP_MS = 60_000;

/**
 * Send a short message to a chat webhook (Slack, Discord, Microsoft Teams, or anything that takes
 * {"text": "..."}) when something breaks on the server. The same message is sent at most once a
 * minute, and a failing webhook never affects the request. Does nothing without ERROR_WEBHOOK_URL.
 */
export async function notifyError(config: Pick<Config, 'ERROR_WEBHOOK_URL' | 'NODE_ENV'>, title: string, detail: string): Promise<boolean> {
  if (!config.ERROR_WEBHOOK_URL) return false;
  const key = createHash('sha1').update(title + detail.slice(0, 200)).digest('hex');
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < MIN_GAP_MS) return false;
  lastSent.set(key, now);
  if (lastSent.size > 500) lastSent.clear();
  try {
    const res = await fetch(config.ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `[Ujjwal Reach ${config.NODE_ENV}] ${title}\n${detail.slice(0, 1500)}` }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Test helper: forget what was sent. */
export function resetAlertThrottle(): void {
  lastSent.clear();
}
