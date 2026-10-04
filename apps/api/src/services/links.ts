export type LinkStatus = 'ok' | 'moved' | 'blocked' | 'broken';

export interface LinkResult {
  id: string;
  url: string;
  status: LinkStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  note: string;
  ms: number;
}

const UA = 'Mozilla/5.0 (compatible; UjjwalReachLinkCheck/1.0; +https://ujjwalreach.example)';

/** Treat the same site with or without www or a trailing slash as "not moved". */
function sameTarget(a: string, b: string): boolean {
  const n = (u: string) => {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}${x.search}`;
  };
  try {
    return n(a) === n(b);
  } catch {
    return a === b;
  }
}

export async function checkLink(
  item: { id: string; url: string },
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<LinkResult> {
  const f = opts.fetchImpl ?? fetch;
  const started = Date.now();
  const done = (status: LinkStatus, httpStatus: number | null, finalUrl: string | null, note: string): LinkResult => ({
    id: item.id,
    url: item.url,
    status,
    httpStatus,
    finalUrl,
    note,
    ms: Date.now() - started,
  });
  try {
    const res = await f(item.url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    // Only the status matters: do not download the page.
    await res.body?.cancel().catch(() => undefined);
    const s = res.status;
    const finalUrl = res.url && res.url !== item.url ? res.url : null;
    if (s >= 200 && s < 300) {
      if (finalUrl && !sameTarget(item.url, finalUrl)) return done('moved', s, finalUrl, 'Redirects to a different address: update the link');
      return done('ok', s, finalUrl, '');
    }
    if (s === 401 || s === 403 || s === 429 || s === 999) return done('blocked', s, finalUrl, 'The site refuses automatic checks: open it by hand');
    if (s === 404 || s === 410) return done('broken', s, finalUrl, 'Page not found');
    return done('broken', s, finalUrl, `HTTP ${s}`);
  } catch (e: any) {
    const code = e?.cause?.code ?? e?.name ?? 'error';
    const note = code === 'TimeoutError' || code === 'ABORT_ERR' ? 'No answer in time' : `Could not connect (${code})`;
    return done('broken', null, null, note);
  }
}

/** Check many links with a limited number at a time, so a slow site cannot stall the rest. */
export async function checkLinks(
  items: Array<{ id: string; url: string }>,
  opts: { concurrency?: number; timeoutMs?: number; fetchImpl?: typeof fetch; onProgress?: (done: number, total: number) => void } = {},
): Promise<LinkResult[]> {
  const out: LinkResult[] = new Array(items.length);
  let next = 0;
  let finished = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await checkLink(items[i]!, opts);
      opts.onProgress?.(++finished, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 8, items.length) }, worker));
  return out;
}
