# Ujjwal Reach Portal: Phase-wise Roadmap

> **2026-10-05: SMS and OTP were dropped.** Phase 4 below describes the earlier plan; see PLAN.md section 4C for what replaced it (no visitor login; the submitted form is saved directly).

This is the phase-by-phase view of [PLAN.md](PLAN.md). PLAN.md has the full detail (decisions, Excel import rules, analytics design, risks). If the two files disagree, PLAN.md wins, and this file is updated to match.

Rules: do phases in order. A phase is finished only when every "Done when" check passes. Update the Status column at the end of each phase.

## Summary

| Phase | Name | Time | Depends on | Status |
|---|---|---|---|---|
| 0 | Prototype cleanup and data preparation | 1-2 days | none | In progress |
| 1 | Project setup | 1 day | 0 | Built (2026-10-04) |
| 2 | Scheme data and rule engine | 2-3 days | 0, 1 | Built and tested (64 tests) |
| 3 | Frontend rebuild | 5-7 days | 2 | Built and tested (21 tests + browser run) |
| 4 | Backend API (saving forms; OTP dropped 2026-10-05) | 5-7 days | 1 | Built and tested |
| 4B | Admin panel and Excel upload | 5-7 days | 2, 4 | Built and tested |
| 4C | Analytics, tags and dashboard | 5-6 days | 3, 4, 4B | Built and tested |
| 5 | Security and compliance | 2-3 days | 4, 4B, 4C | Built and tested; lawyer review and penetration test still needed |
| 6 | Hosting and deployment | 2-3 days | 5 | Prepared (image, compose, backups, alerts, guide); not deployed: needs your accounts |
| 7 | Load test and launch | 2-3 days | 6 | Load test run on one laptop (realistic load passes, spike not proven); launch not done |
| 8 | After launch | ongoing | 7 | Tooling and guides built; the work itself starts after launch |

Total for one developer: about 30 to 42 working days, which is 6 to 8 weeks. With two developers, Phase 3 (frontend) and Phase 4 (backend) can run at the same time and save about one week.

Build notes for phases 1 to 4C (2026-10-04): 207 automated tests pass (API 122, schemes 64, web 21), lint and type checks are clean, and a real browser run against the running API and website passed 33 of 33 checks (public flows, OTP save, Hindi, mobile layout, admin sign-in with two-step, Excel upload preview, review confirmation, analytics, masked user activity). Two things were not exercised with real services and must be checked in Phase 6: the production Postgres connection (`pg`; tests and development use PGlite) and live SMS (MSG91). See README.md to run it.

Build notes for phases 5 to 8 (2026-10-04): 310 automated tests pass (API 210 on both the built-in database and a real PostgreSQL 18 server, schemes 79, web 21), lint, type checks and `npm audit` are clean. Findings during this work that changed the design: the website became a static export for a CDN (a single Node server dropped 15% of connections in a 10,000-visitor burst); tracking writes are batched; two real bugs were found by running the stack (dashboard dates in UTC instead of India time, admin menu and trailing slashes) and one by running real Postgres (a Windows database in a legacy encoding could not store the rupee sign, so start-up now refuses a non-UTF-8 database). What is NOT done and cannot be done without you: deploying to real hosting, live SMS, a lawyer's and a penetration tester's review, and the Phase 0 data work. See docs/LAUNCH_CHECKLIST.md.

## Week-by-week view (one developer)

| Week | Phases |
|---|---|
| 1 | 0, 1, start of 2 |
| 2 | finish 2, start 3 |
| 3 | finish 3 |
| 4 | 4 |
| 5 | 4B |
| 6 | 4C |
| 7 | 5, 6 |
| 8 | 7 (load test and launch), buffer for fixes |

---

## Phase 0: Prototype cleanup and data preparation
**Goal:** the prototype is honest and correct, and the data to be loaded later is ready.

**Tasks**
- [x] Remove `[cite: 7]` text, fix the false "116 schemes" claim, escape user input, add `rel="noopener noreferrer"` to links.
- [x] Decide the income brackets.
- [x] Create the final Excel template `data/Scheme_Template.xlsx`.
- [x] Decide the meaning of `Scheme-specific`, `Mixed` and `Not specified` values.
- [ ] Fill Description, Income_Max, Education_Levels, Status and Last_Verified_Date for the 83 Delhi schemes (needs a person who can verify the facts).
- [ ] Prepare the Madhya Pradesh spreadsheet in the same template, with an official link and eligibility for each scheme.

**Deliverables:** fixed prototype, final Excel template, Delhi and Madhya Pradesh spreadsheets.

**Done when:** the prototype shows no stray text or false claims, and both state spreadsheets follow the final template and have been reviewed.

---

## Phase 1: Project setup
**Goal:** an empty but working project that every later phase builds on.

**Tasks**
- Create the git repository and the monorepo (`apps/web`, `apps/api`, `packages/schemes`, `data`).
- Set up TypeScript, lint and formatting.
- Add `.env.example` and a README with run instructions.
- Set up CI (lint, type check, tests on every push).

**Deliverables:** repository, README, CI workflow.

**Done when:** `apps/web` and `apps/api` both start locally and CI is green.

---

## Phase 2: Scheme data and rule engine
**Goal:** turn the Excel rows into eligibility rules, with tests.

**Tasks**
- Write the mapping table (every Excel spelling to one normalized value) in `packages/schemes`.
- Write the Excel parser and the rule engine.
- Write the validation script (required fields, valid links, known values, tag format) that the API will reuse.
- Unit tests for every operator and a sample of real schemes.
- Run the parser on the Delhi file and fix the mapping until all 83 rows import with no unknown values.

**Deliverables:** `packages/schemes` with parser, rule engine, validator and tests.

**Done when:** tests pass, all 83 Delhi schemes parse into rules, and the prototype schemes give the same result through the engine as through the old `match()` functions.

---

## Phase 3: Frontend rebuild
**Goal:** the public portal in Next.js, working without a backend.

**Tasks**
- Rebuild the flow: state selection, mode selection, personal form, family form (add, edit, remove members), results with member tabs.
- Use the rule engine from `packages/schemes` in the browser.
- Mobile-first layout, Hindi and English with one language switch.
- Form validation (mobile 10 digits, pincode 6 digits, age range).
- Consent checkbox and a privacy policy page.

**Deliverables:** `apps/web` public pages.

**Done when:** the full flow works for both states with no backend and works on a small phone screen.

---

## Phase 4: Backend API and OTP
**Goal:** real registration with mobile OTP.

**Tasks**
- Database tables: users, families, family_members, registrations, otp_requests.
- Endpoints: send OTP, verify OTP, save personal registration, save family card, fetch a saved record.
- OTP rules: expires in 5 minutes, limited attempts, rate limit per number and per IP.
- Input validation on every endpoint and parameterized queries only.
- Replace the fake "Check Status" modal with the real OTP flow (no Aadhaar field).

**Deliverables:** `apps/api` with migrations and tests.

**Done when:** API tests pass and the frontend can register, verify OTP and reload a saved record.

---

## Phase 4B: Admin panel and Excel upload
**Goal:** admins manage schemes by uploading Excel, safely.

**Tasks**
- Admin accounts with email, password, TOTP, roles (`super_admin`, `editor`) and the audit log.
- Excel import: upload, validate, preview (New, Updated, Unchanged, Error), confirm, save in one transaction, publish, rollback.
- Template download and scheme export.
- Admin pages: login, schemes list and edit, upload with preview, import history.
- Rebuild the cached scheme JSON per state after every import or edit, and clear the CDN cache.
- Tests: valid file, wrong type, oversized, duplicate IDs, unknown values, bad links, rollback, non-admin refused.

**Deliverables:** `/admin` pages and admin API.

**Done when:** an admin can upload the Delhi Excel, see the preview, confirm it, see the 83 schemes live on the public site, and roll the import back.

---

## Phase 4C: Analytics, tags and dashboard
**Goal:** the admin can see how many users fill the forms, which schemes they see and click, and which schemes perform best, grouped by tags.

**Tasks**
- Add the `Tags` column to the template and import, auto-create tags from the Excel columns, and let admins edit tags.
- Add batched event tracking in the frontend and `POST /events`, with consent checks.
- Build the hourly and nightly summary jobs and tables.
- Build the dashboard: overview, funnel, scheme performance, tag report, user activity, geography, export.
- Mask mobile numbers, restrict User activity to `super_admin`, log every view.
- Tests: events stored, nothing stored without consent, summaries match raw events, tag format, non-admin refused.

**Deliverables:** event pipeline and dashboard pages.

**Done when:** after a test session the dashboard shows the right form counts, the schemes shown and clicked for that user, and the top schemes by tag, and the numbers match the raw events.

---

## Phase 5: Security and compliance
**Goal:** safe to hold real people's data.

**Tasks**
- DPDP Act 2023: consent record (including tracking consent), privacy policy, terms, data deletion on request, 12-month event retention.
- Encrypt sensitive data (caste category, income, address) or the full database at rest.
- HTTPS only, secure headers, CORS limited to the web domain, no secrets in the repository.
- Check that no Aadhaar number is collected, logged or stored anywhere.

**Deliverables:** signed-off security checklist.

**Done when:** the checklist is complete and a basic security review finds no open high-severity issue.

---

## Phase 6: Hosting and deployment
**Goal:** staging and production running in India.

**Tasks**
- Deploy the frontend (Vercel or Cloudflare Pages), the API (Render, Railway or Lightsail/EC2) and managed PostgreSQL, all in Mumbai.
- Staging and production environments, domain and SSL.
- Daily automatic database backups, and one tested restore.
- Uptime monitoring and error tracking.

**Deliverables:** live staging and production, backup and monitoring setup.

**Done when:** staging and production are live and the restore test succeeded.

---

## Phase 7: Load test and launch
**Goal:** prove it handles 10,000 concurrent users, then go live.

**Tasks**
- Load test with k6: 10,000 concurrent users on the frontend and a realistic share on the API (OTP, register, events).
- Fix bottlenecks. Add a second API instance only if the test needs it.
- Launch with Delhi and Madhya Pradesh. Watch errors and SMS usage for the first week.

**Deliverables:** load test report, launch checklist.

**Done when:** error rate is under 1%, the API responds in under 500 ms at the 95th percentile, and the launch checklist is complete.

---

## Phase 8: After launch (ongoing)
- Add new states one at a time (an Excel file in the template, the district list, and tests, with no change to the scheme code).
- Review scheme links and rules every quarter.
- Improve the dashboard and admin panel from real use.

---

## Working rules
1. One phase at a time, in order.
2. Every change goes through a git branch and a pull request, and CI must pass.
3. Scheme data changes go through the admin Excel upload, never by hand in the database.
4. No new tool, library or hosting service without updating PLAN.md section 2 first.
5. Never ask for or store Aadhaar numbers.
6. At the end of each phase, update the Status column here, add real dates, and note any scope change in PLAN.md.
