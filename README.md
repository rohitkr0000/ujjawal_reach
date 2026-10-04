# Ujjwal Reach Welfare Portal

A web portal where a person picks a state (Delhi or Madhya Pradesh), enters personal or family details, and sees the government schemes they may qualify for, with links to the official portals. Admins manage the schemes by uploading Excel files and can see how people use the portal.

The plan is in [PLAN.md](PLAN.md) and the phase roadmap in [PHASES.md](PHASES.md). Guides: [deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY.md), [load results and launch checklist](docs/LAUNCH_CHECKLIST.md), [running it after launch](docs/OPERATIONS.md), [adding a state](docs/ADDING_A_STATE.md).

## What is in this repository

```
apps/web         Website (Next.js, built as a static site for a CDN): public portal (Hindi + English) and the /admin panel
apps/api         Fastify API: saving submitted forms, admin sign-in, Excel import, analytics
packages/schemes Shared code: scheme types, eligibility rule engine, Excel template/parser, tags
data/            Scheme spreadsheets (source files and the Excel template)
deploy/          Backup and restore-test scripts
docs/            Deployment, security, launch and operations guides
loadtest/        Load test scripts (Node and k6)
legacy/          The original single-file prototype (kept for reference)
```

How eligibility works: every scheme is a row of the Excel template. Its columns become a list of conditions (age, income, caste, beneficiary type, education, gender). The rule engine in `packages/schemes` checks them in the visitor's browser, so the portal needs no server to show results. The API stores saved cards, serves the published scheme file, and handles admin and analytics.

## Run it on your computer

Needs Node.js 20 or newer. No database needs to be installed: in development the API uses PGlite (Postgres compiled to run inside Node) and keeps its data in `apps/api/.data`.

```bash
npm install
cp .env.example .env            # then edit if you want; the defaults work for development

# terminal 1: the API (creates the database, loads the Delhi and MP spreadsheets, creates the first admin)
BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD="a long password 123" npm run dev:api

# terminal 2: the website
echo NEXT_PUBLIC_API_URL=http://localhost:4000 > apps/web/.env.local
npm run dev:web
```

- Website: http://localhost:3000
- Admin panel: http://localhost:3000/admin/login (first sign in asks you to scan a QR code with an authenticator app)
- There is no visitor login and no SMS: a visitor fills the form, sees the schemes at once, and the form is saved.

Without `NEXT_PUBLIC_API_URL` the website still works from the static scheme files in `apps/web/public/data`; saving the form and tracking are then switched off.

## Everyday commands

| Command | What it does |
|---|---|
| `npm test` | All tests (schemes, API, web) |
| `npm run lint` and `npm run typecheck` | Code checks |
| `npm run data:build` | Rebuilds `data/*.xlsx` and `apps/web/public/data/*.json` from the source spreadsheets |
| `npm run seed -w @ujjwal/api` | Loads the spreadsheets in `data/` into the API database through the normal import path |
| `npm run admin:create -w @ujjwal/api -- you@example.com "password" super_admin` | Creates an admin from the command line |
| `npm run build` | Production builds of the API and the website (the website goes to `apps/web/out`) |
| `TEST_DATABASE_URL=postgres://... npm test -w @ujjwal/api` | Runs the API tests on a real Postgres server instead of the built-in one |
| `npm run links:check -w @ujjwal/api` | Checks every official scheme link (quarterly review) |
| `npm run data:refresh -w @ujjwal/web` | Copies the live scheme files into the website's offline fallback before a build |
| `node loadtest/journey.mjs` | Load test (staging only, see docs/LAUNCH_CHECKLIST.md) |

## Managing schemes (admin)

1. Admin panel, **Excel upload**, **Download template** (or export the current schemes of a state, edit, upload again).
2. Fill the sheet, one scheme per row. Blank rule columns mean "no rule". Write `needs review` in Source_Note when rules are unclear: such a scheme stays hidden from the public until an admin opens it and clicks "I checked it".
3. Upload, read the **preview** (New, Updated, Unchanged, Error for every row), then confirm. Nothing goes live before that. A saved import can be **rolled back** from the history.
4. Rows missing from a new upload are not deleted. Set `Status` to `inactive` to hide a scheme.

## Production setup (outline)

The full guide is [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short:

- **Website:** a static site. `NEXT_PUBLIC_API_URL=https://api.example.in npm run build -w @ujjwal/web`, then upload `apps/web/out` to Cloudflare Pages (or any static host or CDN). It never runs a Node server, so a traffic spike does not reach your servers.
- **Database:** managed PostgreSQL in the Mumbai region, UTF-8. Set `DATABASE_URL`. Migrations run when the API starts.
- **API:** a Node 22 container (`apps/api/Dockerfile`, or `docker compose up` for a rehearsal) on a host with an Indian region. Set `NODE_ENV=production`, `JWT_SECRET` and `CORS_ORIGINS`. The API refuses to start in production with missing or default secrets.
- **First admin:** set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` for the first start, then remove them.
- **Backups and monitoring:** `deploy/backup.sh`, `deploy/restore-test.sh`, an uptime monitor on `/health`, and `ERROR_WEBHOOK_URL` for error alerts.

## Privacy rules built in

- Aadhaar numbers are never asked for or stored. There is no visitor login: mobile numbers on the form are not verified.
- Activity tracking (which schemes were shown and clicked) only starts after the visitor allows it. A person's activity is linked to their submitted form only if they ticked the tracking box on the form.
- Mobile numbers are masked in the admin lists. Opening a person's activity, or revealing a number, is possible only for a super admin and is written to the audit log.
- A person asks the helpline to delete their data, and a super admin does it in the admin panel (User activity). Activity records are deleted after 12 months.
