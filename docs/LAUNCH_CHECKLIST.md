# Load test results and launch checklist (Phase 7)

## What was measured

Test tool: `loadtest/journey.mjs` (also `loadtest/k6.js` for a cloud load generator). Each virtual visitor opens the scheme file, sends 3 tracking batches, and 15% also submit a family form that is saved. Pass marks from PLAN.md: error rate under 1% and API p95 under 500 ms.

**Where it was run:** a laptop with a 4-core Intel i3 and 7.7 GB RAM. The load generator, the API and a real PostgreSQL 18 server all ran on that one machine, so they competed for the same four cores. This is a harsh and unrealistic setup: in production the generator is elsewhere and the API and database have their own machines.

Measured on 2026-10-05 after SMS and OTP were removed (each visitor now only downloads the scheme file, sends tracking, and 15% submit a form). The figures from before that change were similar: realistic load passed (15,843 at once, p95 199 ms) and the spike failed.

| Scenario | Visitors | Peak at once | Requests/s | Errors | API p95 (generator) | API p95 (inside server) | Result |
|---|---|---|---|---|---|---|---|
| **Realistic**: people take 8 to 25 seconds per step, arriving over 40 s | 16,000 | **15,786** | 502 | 0 | 11 ms | under 1 ms (form saves: 19 ms) | **Pass** |
| **Stress spike**: all arrive within 10 s, almost no waiting | 10,000 | 10,000 | 885 | 0 | 14.2 s | 2 ms for tracking; 3.4 s for form saves | **Fail** |

How to read this:

- The realistic scenarios are what "10,000 users at one time" means: thousands of people active together, each doing something every few seconds. They pass with a wide margin, with zero errors.
- The spike compresses a whole visit into about one second for every visitor. It is far harsher than real behaviour (a person needs minutes to fill a form). No request failed, but the one machine ran out of CPU at roughly 900 to 1,800 requests per second (it varied between runs), so requests queued. The time spent *inside* the server was tiny for everything except saving a submitted form (about 3 seconds at that peak, because 1,500 forms arrived within seconds and the database shared the laptop's four cores). Most of the 14 seconds the load generator saw was requests waiting their turn in front of the busy server. This scenario has **not** been shown to pass; it needs to be repeated on staging with separate machines.
- The tracking writes are batched (one insert per second instead of one per request). The first run, before batching, reached about 1,100 requests/s with a p95 of 6.9 s; batching raised it to about 1,800 and cut the p95.

Earlier finding that changed the design: serving the website from a Node server (`next start`) dropped 15% of connections when 10,000 visitors arrived in 20 seconds. The website is now a static export served by a CDN, which removes that risk; a plain static file server served the same burst with zero errors.

## Decide your launch standard

- If your real expectation is the realistic profile (thousands of people active, spread over minutes), the measured results already meet the marks and one API instance with a modest managed database is a sound start.
- If you expect a sudden burst (for example an announcement on TV or a WhatsApp forward reaching a whole state in seconds), repeat the spike scenario on staging before launch and add API instances until it passes.

Run it against staging, never production:

```bash
# on a machine that is not the API server
API=https://api-staging.example.in WEB=https://staging.example.in \
USERS=10000 RAMP=10 CONNECTIONS=3000 MEASURE=server node loadtest/journey.mjs
```

Staging needs `DISABLE_IP_LIMITS=true` so all fake visitors can share one IP (the API refuses this in production). Use `SAVE_RATE=0` to test only the public pages.

## Launch checklist

Tick each item; do not launch with an open item in sections A and B.

### A. Data (Phase 0, needs a person who can verify the facts)
- [ ] Delhi: fill Description, Income_Max, Education_Levels, Last_Verified_Date for the 83 schemes in `data/Delhi_Schemes.xlsx` (and Hindi descriptions if wanted), upload, check the preview.
- [ ] Delhi: open each of the 11 "needs review" schemes in the admin panel, correct the rules, click "I checked it".
- [ ] Madhya Pradesh: replace the unverified prototype data with a verified sheet (official link and eligibility for each scheme).
- [ ] Every scheme's official link works: run `npm run links:check -w @ujjwal/api` against staging.

### B. Accounts and approvals (needs you)
- [ ] Hosting, database and domain created (DEPLOYMENT.md).
- [ ] Privacy policy and terms reviewed by a lawyer (they are drafts); grievance contact added.
- [ ] Hindi text read by a native speaker.
- [ ] Penetration test done, findings fixed (SECURITY.md).

### C. Technical (follow DEPLOYMENT.md)
- [ ] Staging works end to end: submit a form and see it in the admin panel.
- [ ] Backup taken and **restored** once (`deploy/restore-test.sh`).
- [ ] Uptime monitor and error webhook working (cause a test error and see the message).
- [ ] Load test run against staging; result written down here: ______
- [ ] Production deployed with the same steps; first super admin created and `BOOTSTRAP_ADMIN_*` removed.
- [ ] Production `/health`, headers and one real card save checked.

### D. Launch day
- [ ] Announce to a small group first (50 to 100 people) for a day.
- [ ] Watch the API log, the error webhook and the admin Analytics page.

### E. First week
- [ ] Daily: errors in the webhook channel; admin Analytics funnel (where do people drop off?).
- [ ] After day 3: look at the "bottom 10" schemes (low click rate) and the form abandon rate; fix wording or rules.
- [ ] After day 7: confirm the backups ran every day; run one restore test.
- [ ] Write down what surprised you, and add it to OPERATIONS.md.
