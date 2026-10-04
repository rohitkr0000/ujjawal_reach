# Running the portal after launch (Phase 8)

## Routine

| When | What | How |
|---|---|---|
| Daily | Look at errors and new submissions | The error webhook channel. Admin Analytics: funnel and registrations |
| Daily (automatic) | Database backup | `deploy/backup.sh` from a scheduled job, plus the provider's automatic backups |
| Weekly | Read the audit log and the admin list | Admin panel, **Admins & audit**. Disable anyone who left |
| Weekly | Scheme performance | Analytics, **Schemes**: top 10, bottom 10. A scheme shown often but never clicked may have a wrong link or confusing text |
| Monthly | Restore test | `deploy/restore-test.sh` on a recent dump |
| Monthly | Dependency check | `npm audit --omit=dev`, update if a high-severity finding appears (CI also fails on one) |
| **Quarterly** | **Scheme review** | See below |

## Quarterly scheme review

Government schemes change: amounts, age limits, portals, even names. Every quarter:

1. **Check the links.** Run
   ```bash
   DATABASE_URL=postgres://... npm run links:check -w @ujjwal/api -- --out links-report.csv
   ```
   It writes a CSV with each scheme's result: `ok`, `moved` (redirects to another address), `broken` (not found, error, no answer) or `blocked` (the site refuses automatic checks: open it by hand). It exits with an error if anything is broken or moved.
2. **Find the stale schemes.** In the admin panel, **Schemes**, click the blue chip "Not verified in 90 days". These are schemes never verified or last verified more than 90 days ago.
3. **Verify each one** against the official page: eligibility, amounts, link. Fix it in the admin panel (or export the state, edit the Excel, upload) and set **Last verified on** to today. Unclear? Write "needs review" in the Source note: the scheme then stays hidden until someone checks it.
4. **Retire what ended.** Set Status to `inactive`; the scheme disappears from the public site but stays in history.
5. **Add new schemes** through the same Excel upload. Use the template (admin panel, **Download template**); every upload shows a preview first and can be rolled back.
6. **Write down the date** you finished, so the next quarter starts from it.

## If something goes wrong

| Problem | What to do |
|---|---|
| A bad Excel upload went live | Admin panel, **Excel upload**, history, **Roll back** on that import. Works as long as no newer import or edit changed the same schemes (then roll those back first) |
| One scheme shows wrong rules | Edit it in **Schemes**, or set Status `inactive` to hide it at once |
| Many fake or junk submissions | Mobile numbers are not verified, so junk can arrive. The API limits each number to 10 saved forms and each address to 60 submissions a minute. Delete junk in **User activity**. If it grows, add a CAPTCHA to the form |
| An admin's phone was lost | A super admin opens **Admins & audit**, clicks **Reset 2-step** for that admin; they set up a new authenticator at next sign-in |
| The only super admin is locked out | Run `npm run admin:create -w @ujjwal/api -- new@example.com "a long password 123" super_admin` with `DATABASE_URL` set, then reset the old account |
| A person asks to delete their data | Admin panel, **User activity**, find them (card id or mobile), open, **Delete this person's data**. People ask the helpline; there is no self-service login |
| The API is down | The website still shows schemes from its built-in copy; only saving the form and tracking stop. Restart the API; check `/health` and the log. If the database is down, check the provider's status page first |
| The database was damaged or deleted | Restore the latest backup into a new database (provider's restore, or `pg_restore`), point `DATABASE_URL` at it, restart the API. The published scheme files are rebuilt from the schemes table automatically; if the table is empty, upload the latest Excel files |
| Traffic is higher than expected | Add API instances (set `RUN_JOBS=false` on all but one) and raise the database size. The website is on a CDN and does not need changing |

## Adding a new state

See [ADDING_A_STATE.md](ADDING_A_STATE.md). It is mostly data: districts, one line of state information and an Excel file.

## Where things are

| Need | Look at |
|---|---|
| How to run it | README.md |
| Why it was built this way, risks | PLAN.md |
| Hosting and deployment | docs/DEPLOYMENT.md |
| Security and privacy | docs/SECURITY.md |
| Load results, launch list | docs/LAUNCH_CHECKLIST.md |
