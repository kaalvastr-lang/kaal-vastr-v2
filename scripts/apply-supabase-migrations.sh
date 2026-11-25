#!/usr/bin/env bash
# Applies every migration in supabase/migrations that the target database has not seen yet.
# Used by .github/workflows/supabase-migrations.yml; can also be run by hand:
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' bash scripts/apply-supabase-migrations.sh
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Postgres connection string of the Supabase project}"
CLI="${SUPABASE_CLI:-supabase}"
# Migrations older than this version came from the original project setup. If the database already
# has the app's tables but no migration history (set up before migrations were tracked), they are
# recorded as applied instead of being run a second time.
BASELINE_BEFORE="${BASELINE_BEFORE:-20261113100000}"

q() { psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -Atc "$1"; }

history_exists=$(q "select to_regclass('supabase_migrations.schema_migrations') is not null")
history_count=0
if [ "$history_exists" = "t" ]; then
  history_count=$(q "select count(*) from supabase_migrations.schema_migrations")
fi
has_sales=$(q "select to_regclass('public.sales') is not null")

if [ "$history_count" = "0" ] && [ "$has_sales" = "t" ]; then
  echo "Existing database without migration history - recording the original migrations as applied."
  for f in supabase/migrations/*.sql; do
    v=$(basename "$f" | cut -d_ -f1)
    if [[ "$v" < "$BASELINE_BEFORE" ]]; then
      "$CLI" migration repair --status applied "$v" --remote="$SUPABASE_DB_URL" --yes
    fi
  done
fi

# --include-all also applies a migration whose version is older than one already applied.
"$CLI" db push --remote="$SUPABASE_DB_URL" --include-all --yes
