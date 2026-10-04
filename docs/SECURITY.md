# Security and compliance checklist (Phase 5)

Status as built on 2026-10-04. "Evidence" says where it is proven. A professional penetration test and a lawyer's review of the privacy documents are still needed before launch (last section).

## Checklist

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | No Aadhaar number is asked for, stored or logged | Done | No such column in the database (`apps/api/src/db/migrations.ts`). The form and the API refuse a 12 digit number in any free-text field (`looksLikeAadhaar`). Tests: `security.test.ts` "Aadhaar numbers are refused", `privacy.test.ts` |
| 2 | HTTPS only | Done in code, enabled by the host | The API sends `Strict-Transport-Security` (helmet). The website sends it through `out/_headers`. The host must serve only HTTPS (all recommended hosts do) |
| 3 | Security headers on the API and the website | Done | API: helmet (`nosniff`, no `X-Powered-By`, etc.). Website: `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` written by `apps/web/scripts/write-headers.mjs` |
| 4 | CORS limited to the website | Done | Only `CORS_ORIGINS` may call the API. The API refuses to start in production with `*`. Test: `public.test.ts` "CORS and headers", `security.test.ts` "production configuration" |
| 5 | No secrets in the repository | Done | `.env` files are git-ignored. Secrets come from the environment. Production refuses to start with a missing or default `JWT_SECRET` |
| 6 | Every admin route needs an admin login; user routes need a user login | Done | `security.test.ts` checks every route declared in the source (more than 30 admin routes) with no token and with a user token |
| 7 | Admin sign-in with a second factor, lockout, replay protection | Done | `admin.test.ts`: authenticator code, a code works once, 5 wrong passwords lock the account for 15 minutes, a disabled admin is cut off at once |
| 8 | Nobody can read other people's data | Done | There is no visitor login and no public route that returns personal data: the only public routes are the scheme file, tracking, the health check and the form submission, which returns just a reference number. `security.test.ts` "no public route returns personal data" |
| 9 | Input validation and no SQL injection | Done | Every request body is checked with a schema. All SQL uses parameters. Test: an injection string is stored as plain text (`registrations.test.ts`) |
| 10 | Output is escaped | Done | React escapes everything; there is no `innerHTML` in the website. Test: a name with HTML is escaped (`results.test.tsx`) |
| 11 | Excel upload is safe | Done | `.xlsx` only, 5 MB, 2,000 rows, file signature checked, formulas rejected, links must be http/https, exports and CSVs strip leading `= + - @`. `imports.test.ts`, `excel.test.ts` |
| 12 | Personal data is protected at rest | Relies on the host | Use a managed Postgres with encryption at rest (RDS, Cloud SQL and similar do this by default). No extra application-level encryption was added: it would block searching and add key-management risk. Revisit if your lawyer requires it |
| 13 | Consent is recorded | Done | `registrations.consent_at` and `consent_tracking`. Tracking events are stored only with consent; a person's activity is linked to them only if they ticked the tracking box. `analytics.test.ts` |
| 14 | A person can have their data deleted | Done | A super admin deletes them on request (`DELETE /admin/users/:id`): this removes forms, activity and the mobile number. Tests in `registrations.test.ts`, `analytics.test.ts` |
| 15 | Data is not kept for ever | Done | A daily job deletes events after 12 months and unconfirmed import previews after 14 days (`runMaintenance`) |
| 16 | Personal data in the admin area is limited and logged | Done | Only a super admin can open per-person activity. Mobile numbers are masked unless they choose to reveal. Every view and every reveal is written to the audit log. `analytics.test.ts` "privacy rules" |
| 17 | Logs and error messages do not leak secrets | Done | The authorization header is redacted from logs. Errors return a generic message with no stack trace or SQL. `security.test.ts`, `alerts.test.ts` |
| 18 | Dependencies have no known high-severity problems | Done | `npm audit --omit=dev` reports 0 vulnerabilities (two transitive packages are pinned to fixed versions with `overrides` in the root `package.json`). CI fails on a high-severity finding |
| 19 | The database runs on a real Postgres in production and refuses a non-UTF-8 database | Done | The whole API test suite passes on PostgreSQL 18 as well as the built-in test database. Start-up fails if the database encoding is not UTF-8 |

## Findings fixed during the review

- Forms did not link labels to inputs (a screen-reader and testing problem). Fixed.
- A 12 digit number could be typed into a name or address. Now refused.
- The dashboard date range used UTC dates while the API counts India days, hiding the last hours of the day. Fixed.
- The admin menu broke when the host added a trailing slash to addresses. Fixed.
- Two dependencies had known vulnerabilities in transitive packages. Pinned to fixed versions.

## Known limits and decisions you should know about

- The admin token lives in the browser's `sessionStorage` (closing the tab signs out; it lasts 8 hours at most). Anyone who can run script on the admin pages could read it. The Content-Security-Policy and the absence of `innerHTML` are the protection. Moving to an `HttpOnly` cookie would need the API and website on the same site.
- The website's CSP allows inline scripts (`'unsafe-inline'`) because the static export of Next.js needs them to start. A nonce-based policy needs a server in front of the pages.
- Rate limits are kept in the API process. With several API instances each counts separately (the limit of 10 saved forms per mobile number lives in the database and is exact).
- Mobile numbers on the form are **not verified** (SMS login was dropped). Anyone can submit a form with someone else's number or with junk. The API limits each number to 10 saved forms and each address to 60 submissions a minute, but cannot prove a number belongs to the person. Add a CAPTCHA if junk becomes a problem.
- Mobile numbers are stored in clear text because the firm must be able to contact people. Treat database access as sensitive.

## Still needed before launch (cannot be done by the developer)

1. A privacy lawyer reads `apps/web/app/privacy/page.tsx` and `terms/page.tsx` (they are drafts) and confirms the consent wording under the DPDP Act 2023, including who the data fiduciary is and the grievance contact.
2. A penetration test by a security professional, especially of the admin area and the form submission route.
3. A native Hindi speaker reads the Hindi text.
