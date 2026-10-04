#!/usr/bin/env bash
# Prove that a backup can really be restored. Restores the dump into a temporary database on the
# same server and compares the number of rows in the main tables with the live database.
#
#   ADMIN_URL=postgres://user:pass@host:5432/postgres \
#   SOURCE_URL=postgres://user:pass@host:5432/dbname \
#   deploy/restore-test.sh backups/ujjwal-20261004-020000.dump
#
# ADMIN_URL must be allowed to create and drop databases. Run this once before launch and then
# every month; a backup that was never restored is only a hope.
set -euo pipefail

DUMP="${1:?Give the path of a .dump file}"
: "${ADMIN_URL:?Set ADMIN_URL (connection to the postgres database)}"
: "${SOURCE_URL:?Set SOURCE_URL (the live database)}"
PSQL="${PSQL:-psql}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"
TMP_DB="restore_test_$(date +%s)"

# Replace the database name at the end of ADMIN_URL.
TMP_URL="${ADMIN_URL%/*}/$TMP_DB"
cleanup() { "$PSQL" "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $TMP_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$PSQL" "$ADMIN_URL" -qc "CREATE DATABASE $TMP_DB ENCODING 'UTF8' TEMPLATE template0"
"$PG_RESTORE" --no-owner --no-privileges --dbname="$TMP_URL" "$DUMP"

STATUS=0
for TABLE in users registrations family_members schemes scheme_imports admins audit_log; do
  A=$("$PSQL" "$SOURCE_URL" -Atc "SELECT count(*) FROM $TABLE")
  B=$("$PSQL" "$TMP_URL" -Atc "SELECT count(*) FROM $TABLE")
  if [ "$A" -gt 0 ] && [ "$B" -eq 0 ]; then
    echo "FAIL: $TABLE has $A rows live but 0 after restore" >&2
    STATUS=1
  else
    echo "ok:   $TABLE live=$A restored=$B (the live copy may hold rows added after the backup)"
  fi
done
echo "Restore test finished. Temporary database $TMP_DB is dropped."
exit $STATUS
