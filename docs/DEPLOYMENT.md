# Deployment guide (Phase 6)

This guide gets staging and then production running. Do staging first with fake data, run the checks at the end, then repeat for production.

**What has and has not been done:** the code, the container image definition, the compose file, the backup scripts and the security headers are written and the pieces were run on a development machine against a real PostgreSQL 18 server. Nothing has been deployed to a hosting account, because that needs your accounts, domain and payment details. The Docker image itself was not built (Docker is not installed on the development machine); the same steps were run by hand and the bundled server started and answered correctly with production settings.

## The shape of it

```
Visitors ──> CDN / static host (website: HTML, CSS, JS)        Cloudflare Pages (recommended)
        └──> API (Node 22 container, 1 to 2 instances)         in the Mumbai region
                  └──> PostgreSQL (managed, Mumbai region)       with automatic daily backups
Alerts: any chat webhook          Uptime: UptimeRobot on /health
```

The website is a static export, so its traffic never reaches your servers. Only the API and the database need sizing. Measured numbers are in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## 1. Database

1. Create a managed PostgreSQL 16 or newer in **Mumbai** (AWS RDS `ap-south-1`, Google Cloud SQL `asia-south1`, or another provider with an Indian region). Size to start: 2 vCPU, 4 GB RAM, 20 GB storage. Turn on automatic daily backups (keep 14 days or more) and encryption at rest.
2. The database must be **UTF-8** (the default on managed services). The API refuses to start otherwise.
3. Create a database and a user for the app. Keep the connection string: `postgres://USER:PASSWORD@HOST:5432/DBNAME`.
4. The API creates its tables itself on first start (migrations). You do not run any SQL by hand.

## 2. API

Build the image from the repository root and run it anywhere that runs containers (AWS Lightsail containers or ECS, Google Cloud Run in Mumbai, Fly.io region `bom`, a plain VM with Docker). Before choosing a platform check that it offers an Indian region: some popular hosts do not.

```bash
docker build -f apps/api/Dockerfile -t ujjwal-api .
```

Set these environment variables (see `.env.example`):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the connection string from step 1 |
| `JWT_SECRET` | a random string, at least 32 characters (for example `openssl rand -hex 32`); signs admin sign-in tokens |
| `CORS_ORIGINS` | the website address, for example `https://portal.example.in` |
| `PUBLIC_API_URL` | the public address of the API |
| `ERROR_WEBHOOK_URL` | optional: a Slack, Discord or Teams webhook that is told about server errors |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | only for the first start; remove afterwards |
| `CF_ZONE_ID`, `CF_API_TOKEN` | only if Cloudflare caches the API's scheme files |

The API refuses to start in production if the secret is missing or still a development default, if CORS is `*`, or if `DISABLE_IP_LIMITS` is set.

Put the API behind HTTPS (every host above does this) and give it its own address, for example `https://api.example.in`. Point the host's health check at `GET /health`.

To run the whole thing on one machine for a rehearsal: copy `.env.example` to `.env`, fill the secrets, then `docker compose up --build`.

**First load of the schemes:** production does not load the spreadsheets by itself. Sign in to the admin panel and upload `data/Delhi_Schemes.xlsx` and `data/MadhyaPradesh_Schemes.xlsx` with the Excel upload page (or, once, run `npm run seed -w @ujjwal/api` with `DATABASE_URL` set).

## 3. Website

Build with the API address, then upload the `out` folder to a static host.

```bash
NEXT_PUBLIC_API_URL=https://api.example.in npm run data:refresh -w @ujjwal/web   # optional: copy the live scheme files into the offline fallback
NEXT_PUBLIC_API_URL=https://api.example.in npm run build -w @ujjwal/web
```

- **Cloudflare Pages** (recommended: free tier, many Indian points of presence): connect the repository, build command `npm ci && npm run build -w @ujjwal/web`, output folder `apps/web/out`, environment variable `NEXT_PUBLIC_API_URL`. The build writes `out/_headers`, which Cloudflare Pages applies automatically (security headers and cache rules).
- **Netlify** reads `_headers` too. **Vercel** and **S3 + CloudFront** do not: copy the headers listed in `apps/web/out/_headers` into the host's header settings.
- Add your domain and HTTPS in the host's settings.

The website still works if the API is down: it shows schemes from the copies in `apps/web/public/data`, and only saving the submitted form and tracking stop.

## 4. Backups

- Keep the provider's automatic backups ON.
- Add an independent copy: run `deploy/backup.sh` daily from a scheduled job (`DATABASE_URL=... deploy/backup.sh /path/to/backups`), and copy the folder to storage in another region.
- **Restore test, once before launch and then every month:** `deploy/restore-test.sh <dump file>`. A backup that has never been restored is only a hope. Both scripts need the PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) and were not run on the development machine, so run them once on staging.

## 5. Monitoring

- **Uptime:** UptimeRobot (free) pinging `https://api.example.in/health` every 5 minutes, alerting your phone or email.
- **Errors:** set `ERROR_WEBHOOK_URL`; the API posts one message per distinct error per minute. For deeper tracing add Sentry later.
- **Traffic and funnel:** the admin Analytics page.
- **Slow requests and errors** are written to the API log (one line each, with the time it took). Every response carries a `Server-Timing` header with the API's own time.

## 6. Checks after deploying

Run these against staging, then production:

1. `GET https://api.../health` answers `{"ok":true}`.
2. Open the website, choose Delhi, fill the personal form, see schemes.
3. Submit the form with a test name and number: the page shows "Your details are saved" with a reference number, and the record appears in the admin panel (User activity).
4. Sign in to `/admin/login`, set up the authenticator, upload the Delhi file, confirm, and see the schemes on the public site.
5. Open the website in a private window with the network blocked for the API address: schemes still appear (offline fallback).
6. Check headers: `curl -I https://portal.example.in` shows `Content-Security-Policy`; `curl -I https://api.example.in/health` shows `Strict-Transport-Security`.
7. Take a backup and run the restore test.
8. Run the load test against staging (LAUNCH_CHECKLIST.md).

## Scaling up later

- More API capacity: run 2 or more instances behind the host's load balancer; set `RUN_JOBS=false` on all but one. The database connection pool is 10 per instance; make sure the database allows enough connections.
- The database is the first thing to grow: raise its CPU and memory. Tracking writes are batched, so the main load is card saves and admin pages.
