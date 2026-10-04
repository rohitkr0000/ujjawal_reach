import type { PublicSchemesFile } from '@ujjwal/schemes';
import { STATE_SLUGS } from '@ujjwal/schemes';
import { API_URL } from './config';

const cache = new Map<string, Promise<PublicSchemesFile>>();

async function fetchJson(url: string): Promise<PublicSchemesFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as PublicSchemesFile;
  if (!data || !Array.isArray(data.schemes)) throw new Error('Bad scheme file');
  return data;
}

/**
 * Loads the published schemes of a state. Tries the API first (always the newest data) and falls
 * back to the static file shipped with the site, so the portal works even if the API is down.
 */
export function loadSchemes(state: string): Promise<PublicSchemesFile> {
  const slug = STATE_SLUGS[state];
  if (!slug) return Promise.reject(new Error(`Unknown state ${state}`));
  let p = cache.get(slug);
  if (!p) {
    p = (async () => {
      if (API_URL) {
        try {
          return await fetchJson(`${API_URL}/public/schemes/${slug}`);
        } catch {
          /* fall through to the static file */
        }
      }
      return fetchJson(`/data/schemes-${slug}.json`);
    })();
    p.catch(() => cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}
