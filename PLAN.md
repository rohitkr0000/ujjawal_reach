# Ujjwal Reach Welfare Portal: Development Plan

> **Decision 2026-10-05: SMS and mobile OTP are dropped for now.** There is no visitor login, no "save my card" step and no status page. A visitor fills the form, sees the schemes immediately, and the submitted form (with their consent) is saved on the server as an unverified record that admins can see. Everything below that mentions OTP, MSG91, DLT, "Check Status" or fetching a saved record describes the earlier plan and no longer applies. Section 4C records the change. Reasons to bring it back later: proof that a number belongs to the person, or letting people look up their own record.

All work on this project follows this plan. Do phases in order. Do not start a phase until the previous phase's "Done when" checks pass. Any change to the plan is written here first.

## 1. Goal
A web portal where a user picks a state, enters personal or family details, and sees the government schemes they may qualify for, with links to the official portals. Registered data and OTP verification are handled by a backend.

- Active states at launch: Delhi, Madhya Pradesh.
- Later: Uttar Pradesh, Uttarakhand, Punjab, others.
- Expected load: 1,000 to 10,000 concurrent users.

## 2. Decisions (fixed unless this plan is edited)
| Area | Decision |
|---|---|
| Language | TypeScript everywhere |
| Frontend | Next.js (React) + Tailwind CSS |
| Backend | Node.js + Fastify (TypeScript) |
| Database | PostgreSQL on Supabase (managed), Mumbai region (`ap-south-1`). Changed 2026-10-05. The API connects with a normal `DATABASE_URL` (Supabase connection pooler, session mode); only Postgres features are used, not Supabase Auth, Storage or its client library |
| SMS / OTP | None (dropped 2026-10-05) |
| Frontend hosting | Static export on Cloudflare Pages (or any static host / CDN) |
| API hosting | Render, Railway or AWS Lightsail/EC2 (Mumbai) |
| Eligibility logic | Runs in the browser, using scheme rules stored as data |
| Aadhaar | Never collected or stored. No visitor login; mobile numbers are not verified |
| Scheme source of truth | The PostgreSQL `schemes` table, managed by admins through the admin panel and Excel upload |
| Excel handling | `.xlsx` read on the server with the `exceljs` library |
| Admin login | Email + password with a second factor (TOTP), roles: `super_admin`, `editor` |

## 3. Target structure
```
ujjawal-reach/
  apps/
    web/            Next.js frontend (public portal + /admin panel)
    api/            Fastify backend (public API + admin API + Excel import)
  packages/
    schemes/        shared types, rule engine, Excel column mapping
  data/
    Delhi_Yojana_Master_With_Links.xlsx   (reference file for the first import)
  PLAN.md
```

Scheme rules become data, not code. Each scheme is a row in the database with: id, state, level, name, description, link, and a list of conditions such as `{ "field": "age", "op": ">=", "value": 60 }`. One small rule engine evaluates them. This replaces the `match()` functions in the current HTML. The public site gets the active schemes as a cached JSON file built from the database.

## 3A. Admin scheme upload (Excel)

### What the existing Excel looks like
File: `Delhi_Yojana_Master_With_Links.xlsx`
- Sheet `All_Schemes_Database`: 83 schemes (IDs `DEL-001` to `DEL-083`), 13 columns:
  `Scheme_ID, Scheme Name, Category / Sector, Level (Delhi / Central), Gender_Focus, Age_Group, Age_Min, Age_Max, Caste_Category, Beneficiary_Type, Residence_Type, Application_Channel, Application_URL`
- Sheet `Eligibility_Checker`: a manual checker for a person. It is not scheme data and is ignored by the import.
- All 83 IDs are unique and all 83 links start with http.

### Problems the import must handle
1. **Free-text values with variants.** Examples: Age_Group has 9 spellings (`Senior citizen (60+)` and `Senior Citizen (60+)`), Application_Channel has 12 (`Delhi e-District`, `Delhi e-District Portal`, `e-District Delhi Portal`), Level has 7, Caste_Category has 12 combinations (`SC, ST, OBC` vs `SC / ST / OBC / Minority`).
2. **Multi-value cells.** Caste_Category and Beneficiary_Type hold several values in one cell, separated by commas or slashes.
3. **Values that cannot become a rule.** `Scheme-specific`, `Mixed / education-stage based` and `Not specified` need a defined meaning (see mapping below).
4. **Missing columns.** There is no description, no income limit, no education requirement and no state column.
5. **Typed text:** names and links need trimming, and links must be checked.

### Rules for turning Excel columns into eligibility rules
| Excel column | Becomes |
|---|---|
| Age_Min / Age_Max | `age >= min` and `age <= max` (120 is treated as no upper limit) |
| Gender_Focus | `Female-focused` means gender = Female. `All/Not gender-specific` means no gender rule |
| Caste_Category | list of allowed categories. `Not specified` means no caste rule |
| Beneficiary_Type | list of allowed occupations or groups, using a mapping table (below) |
| Residence_Type | stored as a label. `Delhi-linked` requires the user to have selected Delhi |
| Level | normalized to `Delhi`, `Central` or `Delhi & Central` |
| Application_Channel / Application_URL | stored as channel label and link |
| Scheme-specific / Mixed values | rule left empty, scheme is marked `needs_review` and shown as "may be eligible" only after an admin confirms it |

A **mapping table** (in `packages/schemes`) lists every known Excel value and the normalized value it becomes, for example `Senior citizen (60+)` and `Senior Citizen (60+)` both become `senior`. A value that is not in the table is reported as an error, never guessed.

### New columns to add to the Excel template
So admins do not need to edit the database by hand, the official template adds these optional columns:
`State, Description, Description_Hindi, Income_Max, Education_Levels, Status (active/inactive), Last_Verified_Date, Source_Note`.
Delhi's file can be filled in once for these columns and re-uploaded.

### Admin panel (`/admin`)
- Login with email, password and TOTP. Roles: `super_admin` (users, delete, publish) and `editor` (upload, edit).
- **Schemes list:** search, filter by state/level/status, edit one scheme, activate or deactivate, delete (super_admin only).
- **Upload Excel:** pick a state, choose a `.xlsx` file, upload.
- **Download template:** a blank Excel with correct headers and the allowed values shown in dropdowns.
- **Export:** download the current schemes of a state as Excel, edit, and upload again.
- **Import history:** who uploaded what, when, how many rows were added, updated, or failed. Each import can be rolled back.

### Import flow (always in two steps, nothing goes live by accident)
1. **Upload.** The server checks file type (`.xlsx` only), size (max 5 MB), and sheet name. It parses the file without saving schemes.
2. **Validate and preview.** For every row the server checks: required fields present, `Scheme_ID` unique in the file, age min <= age max, link is a valid http/https URL, every value is in the mapping table. The admin sees a preview table with each row marked **New**, **Updated** (with changed fields highlighted), **Unchanged**, or **Error** (with the reason). A downloadable error report is provided.
3. **Confirm.** The admin chooses to import. Rows with errors are skipped or the whole import is cancelled (admin's choice, default: cancel).
4. **Save.** All valid rows are saved in one database transaction (all or nothing), matched by `Scheme_ID` (insert or update). The import is stored in the import history with the original file.
5. **Publish.** The server rebuilds the cached scheme JSON for that state and clears the CDN cache. The change shows on the public site within a few minutes.
6. **Rollback.** An admin can revert an import. Schemes return to their previous version, and the JSON is rebuilt.

Rows missing from a new upload are **not** deleted. To remove a scheme, an admin sets Status to `inactive` or deletes it in the panel.

### Database tables for this feature
`schemes`, `scheme_versions` (every change, for rollback), `scheme_imports` (file, admin, counts, status), `scheme_import_rows` (row-level result), `admins`, `audit_log`.

### Admin API (all require admin login)
- `POST /admin/imports` (upload and validate, returns preview)
- `POST /admin/imports/:id/confirm`
- `POST /admin/imports/:id/rollback`
- `GET /admin/imports`, `GET /admin/imports/:id/errors`
- `GET /admin/template`, `GET /admin/schemes/export?state=`
- `GET/PATCH/DELETE /admin/schemes/:id`

### Security for uploads
- Admin accounts only, with TOTP. Failed logins are rate limited.
- Accept only `.xlsx`, check the file signature, limit size and row count (max 2,000 rows), do not run macros (`.xlsm` rejected).
- Strip leading `=`, `+`, `-`, `@` from text cells when exporting so exported files cannot run formulas (CSV/Excel injection).
- Links must be http/https, and are shown to users with `rel="noopener noreferrer"`.
- Every admin action is written to `audit_log`.

## 3B. Analytics and tracking (admin dashboard)

### What the admin must be able to see
1. **How many users filled the data**: forms started, forms completed, drop-off at each step, per state and per day.
2. **Which user tried which yojna**: for each registered user, the schemes shown to them and the schemes they clicked "Official Page" on.
3. **Which yojna performs the most**: for each scheme, how many times it was shown (matched), how many times it was clicked, and the click rate, with a top and bottom list.
4. **Grouping by tags (hashtags)**: every scheme and every user group gets tags, so the numbers can be filtered and compared by tag.

### Tags (hashtags)
Tags are short labels written without spaces and shown with `#`. A scheme can have many tags. Tags come from the Excel columns automatically (so admins do not retype them) and admins can add more.

| Tag type | Examples | Comes from |
|---|---|---|
| State | `#delhi` `#madhyapradesh` | State column |
| Level | `#central` `#statescheme` | Level column |
| Sector | `#womenchild` `#education` `#health` `#housing` | Category / Sector |
| Beneficiary | `#student` `#farmer` `#worker` `#seniorcitizen` `#woman` `#pwd` | Beneficiary_Type |
| Caste group | `#sc` `#st` `#obc` `#ews` `#minority` | Caste_Category |
| Age group | `#child` `#adult` `#senior` | Age_Min / Age_Max |
| Channel | `#edistrict` `#onlineportal` `#helpline` | Application_Channel |
| Admin tags | `#featured` `#newscheme` `#campaign-oct2026` | typed by admin |

Rules: lowercase, no spaces, letters and numbers only (plus `-`), maximum 30 characters, stored in `tags` and `scheme_tags` tables. The Excel template gets an optional `Tags` column (example: `#featured #newscheme`). The import checks the format and rejects bad tags.

### Events to record
Each event stores: event type, time, state, device type, session id, user id (if registered), scheme id (if relevant), and the tags of that scheme at that time.

| Event | When |
|---|---|
| `state_selected` | user picks a state |
| `mode_selected` | personal or family chosen |
| `form_started` | first field typed |
| `form_step_completed` | each section finished |
| `form_submitted` | form submitted and saved |
| `form_abandoned` | user leaves before submitting |
| `scheme_shown` | scheme appears in a user's result |
| `scheme_clicked` | user clicks "Official Page" for a scheme |
| `otp_sent` / `otp_verified` | OTP steps |

### Reports in the admin dashboard
- **Overview:** total visitors, forms started, completed, completion rate, new registrations per day, split by state.
- **Funnel:** state selected, form started, submitted, results viewed, scheme clicked, with the percentage lost at each step.
- **Scheme performance:** a table with scheme name, tags, times shown, times clicked, click rate. Sort and filter by tag, state, level and date range. Top 10 and bottom 10 lists.
- **Tag report:** the same numbers grouped by tag (for example, how `#student` schemes compare with `#farmer` schemes).
- **User activity:** a searchable list of registered users, each user's details, the schemes shown to them and the schemes they clicked, with times. Only `super_admin` can open this.
- **Geography:** registrations and clicks per district.
- **Export:** every report downloads as Excel or CSV.

### How it is built (kept light for 1,000 to 10,000 users)
- The browser sends events in small batches to one endpoint, `POST /events`. The API writes them to a PostgreSQL `events` table through a queue in memory, so tracking never slows the user.
- A nightly job and an hourly job fill summary tables (`daily_scheme_stats`, `daily_funnel_stats`, `daily_tag_stats`). The dashboard reads the summary tables, not the raw events, so it stays fast.
- Raw events are kept for 12 months, summaries for as long as needed.
- No third-party tracker that sends user data abroad. Optionally Google Analytics or Plausible can be added for page-level traffic only, with no personal data.

### Tables and API
Tables: `events`, `tags`, `scheme_tags`, `daily_scheme_stats`, `daily_funnel_stats`, `daily_tag_stats`.
Admin API: `GET /admin/analytics/overview`, `/funnel`, `/schemes`, `/tags`, `/users`, `/users/:id/activity`, `/export`. All require admin login.

### Privacy rules for tracking (DPDP Act 2023)
- The consent checkbox on the form says clearly that the user's details and the schemes they view and click will be recorded. No consent, no tracking of that user.
- Anonymous visitors are tracked by a random session id only, with no personal data.
- "Which user tried which scheme" is shown only for registered users who gave consent. The mobile number is masked in lists (for example `98XXXXXX29`) and shown in full only to `super_admin`.
- Every view of the User activity report is written to `audit_log`.
- A user can ask for deletion. Their events are deleted or anonymized, and the summary numbers stay.

## 4. Phases

### Phase 0: Cleanup of the prototype (1 to 2 days)
- Fix known issues in `scheme eligibility.html`: remove `[cite: 7]` text, correct the "116 schemes" claim to the real number, escape user input rendered with `innerHTML`.
- Decide the real income brackets and use them in the form and the rules.
- Review `Delhi_Yojana_Master_With_Links.xlsx` (83 schemes). Decide the meaning of `Scheme-specific` and `Mixed` values, and fill the new template columns (Description, Income_Max, Education_Levels, Status) for Delhi.
- Prepare the same spreadsheet for Madhya Pradesh in the same format, with an official link and eligibility for each scheme.
- Finalize the Excel template (headers and allowed values) so admins and developers use one format.

Done when: the prototype shows no stray text, no false claims, and both state spreadsheets are reviewed and follow the final template.

**Phase 0 status (2026-10-04): in progress**

Done:
- Prototype fixed: `[cite: 7]` removed, "116 schemes" claim replaced (the prototype really has 12 Delhi and 15 Madhya Pradesh schemes; the card now says "15 Schemes (prototype)"), user input escaped before `innerHTML`, `rel="noopener noreferrer"` added to official links.
- Income brackets decided (form value = lower bound of the bracket, so a person who may be under a limit still sees the scheme; the results page carries a disclaimer): Below ₹1 Lakh (0), ₹1-2 Lakh (100000), ₹2-2.5 Lakh (200000), ₹2.5-3 Lakh (250000), Above ₹3 Lakh (300001). These match the limits used by the rules (2.5 L and 3 L).
- Final Excel template created: `data/Scheme_Template.xlsx` (Schemes, Allowed_Values and Instructions sheets, dropdowns, 21 columns). The Delhi reference file moved to `data/`.
- Meaning of unclear values confirmed as written in section 3A: `Scheme-specific`, `Mixed / education-stage based` and `Not specified` give no rule and the scheme is `needs_review`.

Scope changes found while reviewing the Delhi file (the real data has more variants than first counted):
- Category / Sector has 30 spellings, Caste_Category 16, Beneficiary_Type 40, Application_Channel 34, Level 7, Age_Group 9, Residence_Type 4. The Phase 2 mapping table must cover all of them. Application_Channel in the template is reduced to 8 normalized values, with the original text kept in Source_Note.
- Level is normalized to `State`, `Central`, `State & Central` (not "Delhi"), so the same values work for every state.
- 7 schemes have no Age_Min or Age_Max, and 7 have Beneficiary_Type `Scheme-specific`.

Still open (needs a person who can verify facts, not guessed by the developer):
- Fill Description, Income_Max, Education_Levels, Status and Last_Verified_Date for the 83 Delhi schemes.
- Prepare the Madhya Pradesh spreadsheet with an official link and eligibility for each scheme (the 15 prototype schemes are a starting point only).

### Phase 1: Project setup (1 day)
- Create the monorepo, git repository and TypeScript, lint and formatting config.
- Add a `.env.example` and a README with run instructions.
- Set up a CI workflow that runs lint, type check and tests on every push.

Done when: `apps/web` and `apps/api` both start locally and CI is green.

### Phase 2: Scheme data and rule engine (2 to 3 days)
- Write the Excel column-to-rule mapping table and the parser in `packages/schemes` (section 3A).
- Write the rule engine and unit tests for every operator and for a sample of real schemes.
- Run the parser on `Delhi_Yojana_Master_With_Links.xlsx` and fix the mapping table until all 83 rows import without unknown values.
- Add a validation script (required fields, valid links, known values) that the API will reuse.

Done when: tests pass, all 83 Delhi schemes parse into rules, and the schemes from the prototype give the same result through the engine as through `match()`.

### Phase 3: Frontend rebuild (5 to 7 days)
- Rebuild the existing flow: state selection, mode selection, personal form, family form with member add/edit/remove, results with member tabs.
- Use the rule engine from `packages/schemes` in the browser.
- Make it mobile-first, with Hindi and English text (one language switch, no mixed text).
- Add form validation (mobile 10 digits, pincode 6 digits, age range) and a consent checkbox with a privacy policy page.

Done when: the full flow works for both states with no backend, and works on a small phone screen.

### Phase 4: Backend API (5 to 7 days)
- Database tables: users, families, family_members, registrations, otp_requests.
- Endpoints: send OTP, verify OTP, save personal registration, save family card, fetch a saved record.
- OTP rules: expires in 5 minutes, limited attempts, rate limit per mobile number and per IP.
- Input validation on every endpoint and parameterized queries only.
- Replace the fake "Check Status" modal with the real OTP flow (no Aadhaar field).

Done when: API tests pass and the frontend can register, verify OTP and reload a saved record.

### Phase 4B: Admin panel and Excel upload (5 to 7 days)
- Admin accounts with email, password and TOTP, roles, and the audit log.
- Excel import API: upload, validate, preview, confirm, save in one transaction, publish, rollback (section 3A).
- Template download and scheme export.
- Admin pages in the Next.js app: login, schemes list and edit, upload with preview table, import history.
- Build the cached scheme JSON per state after every import or edit and clear the CDN cache.
- Tests: valid file, wrong file type, oversized file, duplicate IDs, unknown values, bad links, rollback, and a non-admin user being refused.

Done when: an admin can upload the Delhi Excel, see the preview, confirm it, see the 83 schemes live on the public site, and roll the import back.

### Phase 4C: Analytics, tags and dashboard (5 to 6 days)
- Add the `Tags` column to the Excel template and import, auto-create tags from the Excel columns, and let admins add and edit tags in the panel.
- Add event tracking to the frontend (batched) and the `POST /events` endpoint, with consent checks.
- Build the summary jobs and tables.
- Build the dashboard pages: overview, funnel, scheme performance, tag report, user activity, geography, export.
- Mask mobile numbers, restrict User activity to `super_admin`, and log every view.
- Tests: events are stored, no events are stored without consent, summaries match the raw events, tag format rules, and a non-admin is refused.

Done when: after a test session, the admin dashboard shows the right form counts, the schemes shown and clicked for that user, and the top schemes by tag, and the numbers match the raw events.

### Phase 5: Security and compliance (2 to 3 days)
- DPDP Act 2023: consent record (including consent for activity tracking), privacy policy, terms, data deletion on request, event retention of 12 months.
- Encrypt sensitive columns (caste category, income, address) or the full database at rest.
- HTTPS only, secure headers, CORS limited to the web domain, no secrets in the repository.
- Check that no Aadhaar number is collected, logged or stored anywhere.

Done when: the checklist above is signed off and a basic security review finds no open high-severity issue.

### Phase 6: Hosting and deployment (2 to 3 days)
- Deploy the frontend to the CDN host, the API to the server, and the database to a managed instance, all in Mumbai.
- Set up staging and production environments, domain and SSL.
- Daily automatic database backups, tested restore once.
- Uptime monitoring and error tracking (UptimeRobot and Sentry or similar).

Done when: staging and production are live and the restore test succeeded.

### Phase 7: Load test and launch (2 to 3 days)
- Load test with k6: 10,000 concurrent users on the frontend and the realistic share on the API (OTP, register).
- Fix bottlenecks. Add a second API instance only if the test needs it.
- Launch with Delhi and Madhya Pradesh. Watch errors and SMS usage for the first week.

Done when: the load test passes (error rate under 1%, API response under 500 ms at the 95th percentile) and the launch checklist is complete.

### Phase 8: After launch
- Add new states one at a time. Each state needs only an Excel file in the template, its district list, and tests. No code change is needed for the schemes themselves.
- Review scheme links and rules every quarter, because government schemes change.
- Optional: admin panel to edit schemes, and a dashboard of registrations.

## 4A. Build record for phases 1 to 4C (2026-10-04) and changes from this plan

What exists now: monorepo (`apps/web`, `apps/api`, `packages/schemes`, `data`), the rule engine and Excel parser, the public portal (Hindi and English, personal and family flows, OTP save, saved-card lookup), the API (OTP, registrations, admin accounts with two-step login, Excel import with preview, confirm and rollback, analytics with tags), and the admin panel. See README.md to run it.

Changes from what this plan said, and why:

| Area | Change |
|---|---|
| Test database | There is no Postgres on the build machine. Development and tests use PGlite (Postgres in WASM, same SQL). Production uses real Postgres through `pg`. The `pg` path has not been run against a real server yet: test it first in Phase 6. |
| Excel template | Added a `Scope` column (Family or Individual) because the portal shows family schemes once and individual schemes per person. Added `Male` to Gender_Focus and `Unemployed` to Beneficiary_Type. The template is generated by code (`buildSchemesWorkbook`), so the file in `data/` and the admin download are always the same. |
| "Needs review" | A scheme needs review when Source_Note says so, or when the legacy Delhi file had a scheme-specific beneficiary or residence value, or odd caste values (`Female`, `LIG`, `MIG`). A missing age range alone does NOT trigger review (7 Delhi schemes have none, and "no age rule" is a valid reading). Result: 11 of 83 Delhi schemes and 1 of 15 Madhya Pradesh schemes are hidden from the public until an admin confirms them. |
| Delhi data | The old file is converted by an adapter with a mapping table (`packages/schemes/src/excel/legacy.ts`) into `data/Delhi_Schemes.xlsx` in the final template format. All 83 rows convert with zero unknown values. Descriptions, income limits, education and verification dates are still empty: Phase 0 still needs a person to fill them. |
| Madhya Pradesh data | `data/MadhyaPradesh_Schemes.xlsx` holds the 15 prototype schemes in the template format. They are NOT verified. Prototype rules written as "A or B" across different fields cannot be expressed in the template; two were simplified and one is marked needs review (see each row's Source_Note). |
| Visitor form | Added a "minority community" checkbox and optional "disability / patient / artisan / homeless" ticks, because some schemes depend on them and they cannot be worked out from the other answers. |
| Rate limits | Per-IP limits are loose (OTP 200 per hour per IP, 30 per minute) because many phones share one address on mobile networks. The per-number limits (5 OTPs per hour, 30 seconds between, 5 wrong tries) are the real protection. |
| Encryption | No application-level encryption of caste, income and address columns. Rely on the managed database's encryption at rest (Phase 5 decides if more is needed). |
| Prototype file | Moved to `legacy/prototype.html`. |

Not done in this build (still open in later phases): hosting and deployment (Phase 6), load test (Phase 7), the Phase 5 security review and DPDP legal review. The privacy policy and terms pages are drafts and need legal review before launch. The Hindi text was written without a native-speaker review.

## 4B. Build record for phases 5 to 8 (2026-10-04) and changes from this plan

| Area | What was done, and what changed |
|---|---|
| Phase 5 | Security review done and written up in docs/SECURITY.md (19 items with evidence). Added: Aadhaar-number refusal, log redaction, CSP and other headers, security tests that check every admin route, a stricter production configuration, dependency fixes (0 known vulnerabilities). |
| Real Postgres | The API test suite now also runs on a real PostgreSQL 18 server (`TEST_DATABASE_URL`) and CI does the same. Start-up refuses a database that is not UTF-8. |
| Website hosting | **Changed:** the website is a static export (`output: 'export'`), served by a CDN, instead of a Next.js server. Reason: measured, a single Node server dropped 15% of connections under a 10,000-visitor burst. Security headers are written to `out/_headers` at build time. The admin edit page moved from `/admin/schemes/[id]` to `/admin/schemes/edit?id=`. |
| Tracking writes | Events are queued in memory and written in batches once a second (`EventBuffer`), and request logging is limited to slow requests and errors. Result: about 60% more throughput on the same machine. |
| Phase 6 | Dockerfile, docker-compose, backup and restore-test scripts, error webhook alerts, deployment guide. Not deployed: needs hosting accounts, a domain and an SMS account. Render and Railway were named in section 2; they may not have an Indian region, so the guide lists the options to check instead. The Docker image and the backup scripts were not run on the build machine (no Docker, no `pg_dump`). |
| Phase 7 | Load test scripts and results in docs/LAUNCH_CHECKLIST.md. Realistic load (15,843 people active at once) passes with 0 errors. A sudden 10,000-in-10-seconds spike did not meet the 500 ms mark on the single test laptop and has not been shown to pass. |
| Phase 8 | Opening a new state is now a data-only change (`STATE_META`, one list of districts, an Excel file). Quarterly review tools: "not verified in 90 days" filter and counts in the admin panel, an official-link checker (`npm run links:check`), an operations guide. |
| Scope kept out | Application-level encryption of columns; Sentry (a chat webhook is used instead); Hindi native-speaker review; legal review. |

## 4C. Change on 2026-10-05: SMS and OTP removed

| Area | What changed |
|---|---|
| Visitor flow | Submit the form, see schemes at once; the form is saved automatically (consent box required). The page shows a reference number, or a message with "Try saving again" if the server is unreachable. Removed: OTP modal, "Save my card", saved-card status page, "Check Status" button. |
| API | Removed: `/auth/otp/*`, `GET /registrations/mine`, `DELETE /me`, the SMS sender (MSG91), `OTP_SECRET`, `SMS_PROVIDER`, `MSG91_*` settings, the `otp_requests` table (migration 004). `POST /registrations` is now public. A person is the first mobile number on the form; each number may save at most 10 forms; each address may submit 60 forms a minute. |
| Admin | Unchanged: sign-in with an authenticator code, Excel upload, analytics. User activity now lists people by the (unverified) mobile number they typed. |
| Deletion | Only through a super admin (the person asks the helpline). There is no self-service deletion because there is no login. |
| Risks added | Anyone can submit forms with someone else's number or with junk. Mitigation: per-number and per-address limits, delete in the admin panel, add a CAPTCHA if it becomes a problem. Tracking can be linked to a number the visitor typed, so a visitor could pollute another person's activity record; this affects statistics only. |
| Removed from the launch list | MSG91 account and DLT registration; SMS cost and abuse risk. |

## 5. Working rules
1. One phase at a time, in order.
2. Every change goes through a git branch and a pull request, and CI must pass.
3. Scheme data changes go through the admin Excel upload, never by editing the database by hand. Each scheme needs an official source link.
4. No new tool, library or hosting service without updating section 2 first.
5. Do not store or ask for Aadhaar numbers.
6. At the end of each phase, update this file with the actual dates and any change in scope.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Wrong or outdated scheme information | Source link for every scheme, quarterly review, disclaimer on the results page |
| Junk or fake form submissions (numbers are not verified) | Per-number and per-address limits, delete in the admin panel, CAPTCHA if abuse appears |
| Personal data leak | Encryption, minimal data, access limited to the API |
| Traffic spike above plan | CDN for everything static, second API instance ready to add |
| Scope growth | New features go to Phase 8 and need a plan edit |
| Bad Excel upload breaks the live site | Two-step preview and confirm, all-or-nothing save, rollback, unknown values rejected |
| Admin account stolen | TOTP, rate-limited login, audit log, `super_admin` needed for deletes |
| Excel values mapped wrongly | Mapping table with tests, `needs_review` status for unclear rows |
| Tracking slows the site or fills the database | Batched events, summary tables for the dashboard, 12-month retention |
| Misuse of per-user activity data | `super_admin` only, masked numbers, audit log, consent required |
| Wrong or messy tags | Strict tag format, tags auto-created from Excel columns, import rejects bad tags |

## 7. Estimated total
About 6 to 8 weeks for one developer, from Phase 0 to launch (the admin panel and Excel import add about one week, and analytics with tags adds about one more week).
