/**
 * Load test: many visitors use the portal at the same time.
 *
 *   API=http://localhost:4000 WEB=http://localhost:3000 USERS=10000 RAMP=10 node loadtest/journey.mjs
 *
 * Every virtual visitor, in order:
 *   1. opens the home page                        (WEB, optional: in production a CDN serves this)
 *   2. downloads the published scheme file        GET  /public/schemes/delhi
 *   3. sends 3 tracking batches                   POST /events
 *   4. SAVE_RATE of them (default 15%) also submit a family form to be saved   POST /registrations
 *
 * The API must run with DISABLE_IP_LIMITS=true (all fake visitors share one IP) and must never be
 * production: the API refuses that setting there. Never run this against a live site.
 * USERS visitors start within RAMP seconds, so "10000 users in 10 seconds" is a sudden spike.
 *
 * Pass marks (PLAN.md phase 7): error rate under 1% and API p95 under 500 ms.
 */
import { Agent, setGlobalDispatcher } from 'undici';

const API = (process.env.API ?? 'http://localhost:4000').replace(/\/$/, '');
const WEB = (process.env.WEB ?? '').replace(/\/$/, '');
const USERS = Number(process.env.USERS ?? 1000);
const RAMP = Number(process.env.RAMP ?? 10);
const SAVE_RATE = Number(process.env.SAVE_RATE ?? 0.15);
// Time a person spends reading and typing between steps. 5000-20000 models real users; the default
// (100-500) squeezes a whole visit into about a second, which is a stress test, not a realistic day.
const THINK_MIN = Number(process.env.THINK_MIN ?? 100);
const THINK_MAX = Number(process.env.THINK_MAX ?? 500);
const MAX_P95_MS = Number(process.env.MAX_P95_MS ?? 500);
const MAX_ERROR_PCT = Number(process.env.MAX_ERROR_PCT ?? 1);

setGlobalDispatcher(new Agent({ connections: Number(process.env.CONNECTIONS ?? 600), keepAliveTimeout: 30_000, headersTimeout: 60_000, bodyTimeout: 60_000 }));

const stats = new Map();
const rec = (name, ms, ok, serverMs) => {
  let s = stats.get(name);
  if (!s) stats.set(name, (s = { lat: [], srv: [], ok: 0, fail: 0, statuses: {} }));
  s.lat.push(ms);
  if (serverMs !== undefined) s.srv.push(serverMs);
  ok ? s.ok++ : s.fail++;
};

async function call(name, url, init = {}, expect = [200, 201, 204, 304]) {
  const t = performance.now();
  try {
    const res = await fetch(url, init);
    const body = res.status === 204 || res.status === 304 ? null : await res.text();
    const ok = expect.includes(res.status);
    const m = /dur=([\d.]+)/.exec(res.headers.get('server-timing') ?? '');
    rec(name, performance.now() - t, ok, m ? Number(m[1]) : undefined);
    if (!ok) {
      const s = stats.get(name);
      s.statuses[res.status] = (s.statuses[res.status] ?? 0) + 1;
    }
    return { ok, status: res.status, body };
  } catch (e) {
    rec(name, performance.now() - t, false);
    const s = stats.get(name);
    const k = e?.cause?.code ?? e?.code ?? 'network';
    s.statuses[k] = (s.statuses[k] ?? 0) + 1;
    return { ok: false, status: 0, body: null };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

const SCHEME_IDS = [];
// A different block of phone numbers every run, so the per-number card limit of the last run does not interfere.
const NUMBER_BASE = Math.floor(Math.random() * 800_000_000);

async function visitor(i) {
  const session = rid(12);
  if (WEB) await call('web: home page', `${WEB}/`);
  const file = await call('api: scheme file', `${API}/public/schemes/delhi`);
  if (file.ok && SCHEME_IDS.length === 0 && file.body) {
    try {
      for (const s of JSON.parse(file.body).schemes.slice(0, 20)) SCHEME_IDS.push(s.id);
    } catch {
      /* ignore */
    }
  }
  const ev = (type, extra = {}) => ({ type, ts: Date.now(), ...extra });
  const sid = () => SCHEME_IDS[Math.floor(Math.random() * SCHEME_IDS.length)];
  const batches = [
    [ev('page_view'), ev('state_selected', { state: 'Delhi' }), ev('mode_selected', { state: 'Delhi' })],
    [ev('form_started', { state: 'Delhi' }), ev('form_submitted', { state: 'Delhi' })],
    SCHEME_IDS.length ? [ev('scheme_shown', { state: 'Delhi', schemeId: sid() }), ev('scheme_shown', { state: 'Delhi', schemeId: sid() }), ev('scheme_clicked', { state: 'Delhi', schemeId: sid() })] : [ev('form_abandoned', { state: 'Delhi' })],
  ];
  for (const events of batches) {
    await call('api: POST /events', `${API}/events`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ consent: true, sessionId: session, device: 'mobile', events }),
    });
    await sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
  }

  if (Math.random() >= SAVE_RATE) return;
  await sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
  const mobile = `9${String(NUMBER_BASE + i).padStart(9, '0')}`;
  await call('api: POST /registrations', `${API}/registrations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'family', state: 'Delhi', district: 'West Delhi', address: { house: '65', locality: 'Shakti Colony', pincode: '110059' },
      family: { income: 100000, category: 'OBC', minority: false, residence: 8 },
      people: [
        { name: 'Asha Devi', relation: 'Self', mobile, gender: 'Female', age: 34, education: 'Secondary', occupation: 'Daily Wages', income: 100000, category: 'OBC', minority: false, special: [] },
        { name: 'Raju', relation: 'Son', mobile, gender: 'Male', age: 9, education: 'Primary', occupation: 'Student', income: 100000, category: 'OBC', minority: false, special: [] },
      ],
      consent: { details: true, tracking: true }, sessionId: session,
    }),
  });
}

const jsonPost = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] ?? 0;

console.log(`Load test: ${USERS} visitors starting within ${RAMP}s, ${Math.round(SAVE_RATE * 100)}% submit a form. API=${API}${WEB ? ` WEB=${WEB}` : ''}`);
const started = performance.now();
let active = 0;
let peak = 0;
const jobs = [];
for (let i = 0; i < USERS; i++) {
  const delay = (i / USERS) * RAMP * 1000;
  jobs.push(
    sleep(delay).then(async () => {
      active++;
      peak = Math.max(peak, active);
      try {
        await visitor(i);
      } finally {
        active--;
      }
    }),
  );
}
await Promise.all(jobs);
const secs = (performance.now() - started) / 1000;

let totalReq = 0;
let totalFail = 0;
const apiLat = [];
const apiSrv = [];
console.log(`\n${'endpoint'.padEnd(30)} ${'requests'.padStart(8)} ${'errors'.padStart(7)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'p99 ms'.padStart(8)} ${'max ms'.padStart(8)}`);
for (const [name, s] of [...stats].sort()) {
  s.lat.sort((a, b) => a - b);
  totalReq += s.lat.length;
  totalFail += s.fail;
  s.srv.sort((a, b) => a - b);
  if (name.startsWith('api:')) {
    apiLat.push(...s.lat);
    apiSrv.push(...s.srv);
  }
  console.log(`${name.padEnd(30)} ${String(s.lat.length).padStart(8)} ${String(s.fail).padStart(7)} ${pct(s.lat, 50).toFixed(0).padStart(8)} ${pct(s.lat, 95).toFixed(0).padStart(8)} ${pct(s.lat, 99).toFixed(0).padStart(8)} ${s.lat.at(-1).toFixed(0).padStart(8)} | ${pct(s.srv, 50).toFixed(0).padStart(5)} / ${pct(s.srv, 95).toFixed(0).padStart(5)}${s.fail ? '   ' + JSON.stringify(s.statuses) : ''}`);
}
apiLat.sort((a, b) => a - b);
apiSrv.sort((a, b) => a - b);
const errPct = (totalFail / totalReq) * 100;
const p95 = pct(apiLat, 95);
const srvP95 = pct(apiSrv, 95);
console.log(`\nDuration ${secs.toFixed(1)} s, ${totalReq} requests (${(totalReq / secs).toFixed(0)}/s), peak ${peak} visitors at once`);
console.log(`Error rate ${errPct.toFixed(2)}% (limit ${MAX_ERROR_PCT}%)`);
console.log(`API p95 as seen by the load generator: ${p95.toFixed(0)} ms (limit ${MAX_P95_MS} ms). This includes waiting for a free connection in the generator itself.`);
console.log(`API p95 measured inside the server (Server-Timing): ${srvP95.toFixed(0)} ms`);
// MEASURE=server judges the server-side time (use when the generator shares a machine with the API).
const judged = process.env.MEASURE === 'server' ? srvP95 : p95;
const pass = errPct < MAX_ERROR_PCT && judged < MAX_P95_MS;
console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(pass ? 0 : 1);
