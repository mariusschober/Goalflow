#!/usr/bin/env bash
set -euo pipefail

migration="supabase/migrations/202608260001_zero_silent_data_loss.sql"
grep -Fq "case when task_payload->>'schedulePrecision' = 'month'" "$migration"
grep -Fq '::date end' "$migration"

for command_name in psql createdb dropdb pg_isready; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "POSTGRES_CASE_REGRESSION=FAIL ($command_name unavailable)" >&2
    exit 1
  }
done
pg_isready -q || { echo 'POSTGRES_CASE_REGRESSION=FAIL (PostgreSQL unavailable)' >&2; exit 1; }

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
malformed="$work_dir/malformed.sql"
cat >"$malformed" <<'SQL'
do $$ begin
  perform case when 'month' = 'month' then to_date('2026-01-01', 'YYYY-MM-DD') else '2026-01-01'::date;
end $$;
SQL

if malformed_output="$(psql -v ON_ERROR_STOP=1 -d postgres -f "$malformed" 2>&1)"; then
  echo 'POSTGRES_CASE_REGRESSION=FAIL (PostgreSQL accepted the unterminated CASE)' >&2
  exit 1
fi
grep -Fq 'syntax error' <<<"$malformed_output" || {
  printf '%s\n' "$malformed_output" >&2
  echo 'POSTGRES_CASE_REGRESSION=FAIL (unexpected PostgreSQL failure)' >&2
  exit 1
}

echo 'POSTGRES_CASE_REGRESSION=PASS'
