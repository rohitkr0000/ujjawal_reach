#!/usr/bin/env bash
# Daily backup of the Ujjwal Reach database.
#
#   DATABASE_URL=postgres://user:pass@host:5432/dbname deploy/backup.sh [backup-folder]
#
# Writes ujjwal-YYYYmmdd-HHMMSS.dump (Postgres custom format, compressed) and deletes backups older
# than KEEP_DAYS (default 14). Run it from cron or a scheduled job, and copy the folder to storage
# in a different place (for example an S3 bucket in another region).
# A managed database (RDS, Cloud SQL, Neon, Supabase) already makes automatic backups: turn them on
# AND keep this script as a second, independent copy.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL}"
DIR="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
PG_DUMP="${PG_DUMP:-pg_dump}"

mkdir -p "$DIR"
FILE="$DIR/ujjwal-$(date +%Y%m%d-%H%M%S).dump"
"$PG_DUMP" --format=custom --no-owner --no-privileges --file="$FILE" "$DATABASE_URL"

# A backup that is empty or tiny is a failed backup.
SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -lt 2000 ]; then
  echo "Backup looks too small ($SIZE bytes): $FILE" >&2
  exit 1
fi
echo "Backup written: $FILE ($SIZE bytes)"

find "$DIR" -name 'ujjwal-*.dump' -mtime +"$KEEP_DAYS" -print -delete
