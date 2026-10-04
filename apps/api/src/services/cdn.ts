import { STATE_SLUGS } from '@ujjwal/schemes';
import type { Config } from '../config';

/**
 * Ask Cloudflare to drop its cached copy of the scheme files so a new import shows up quickly.
 * Does nothing unless CF_ZONE_ID and CF_API_TOKEN are set. Failures are logged, never thrown:
 * the browser cache still expires after a few minutes.
 */
export async function purgeSchemeFiles(config: Config, states: string[]): Promise<void> {
  if (!config.CF_ZONE_ID || !config.CF_API_TOKEN || states.length === 0) return;
  const files = states
    .map((s) => STATE_SLUGS[s])
    .filter((s): s is string => !!s)
    .map((slug) => `${config.PUBLIC_API_URL.replace(/\/$/, '')}/public/schemes/${slug}`);
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${config.CF_ZONE_ID}/purge_cache`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.CF_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ files }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`CDN purge failed with status ${res.status}`);
  } catch (e) {
    console.error('CDN purge failed', e instanceof Error ? e.message : e);
  }
}
