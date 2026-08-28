#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
suffix="${RANDOM}_$$"
empty_database="goalflow_empty_${suffix}"
upgrade_database="goalflow_upgrade_${suffix}"

cleanup() {
  dropdb --if-exists --force "${empty_database}" >/dev/null 2>&1 || true
  dropdb --if-exists --force "${upgrade_database}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

createdb "${empty_database}"
createdb "${upgrade_database}"

psql -v ON_ERROR_STOP=1 -d "${empty_database}" -f "${repository_root}/scripts/supabase-test-bootstrap.sql" >/dev/null
for migration in "${repository_root}"/supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -d "${empty_database}" -f "${migration}" >/dev/null
done

psql -v ON_ERROR_STOP=1 -d "${upgrade_database}" -f "${repository_root}/scripts/supabase-test-bootstrap.sql" >/dev/null
for migration in \
  "${repository_root}/supabase/migrations/202607170001_foundation.sql" \
  "${repository_root}/supabase/migrations/202607180001_scheduled_execution.sql" \
  "${repository_root}/supabase/migrations/202608250001_reliability_hardening.sql"; do
  psql -v ON_ERROR_STOP=1 -d "${upgrade_database}" -f "${migration}" >/dev/null
done
psql -v ON_ERROR_STOP=1 -d "${upgrade_database}" -f "${repository_root}/scripts/migration-current-seed.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -d "${upgrade_database}" -f "${repository_root}/supabase/migrations/202608260001_zero_silent_data_loss.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -d "${upgrade_database}" -f "${repository_root}/scripts/migration-integrity-assertions.sql" >/dev/null

echo '{"status":"PASS","emptyDatabase":"PASS","currentSchemaUpgrade":"PASS","idempotency":"PASS","atomicRestore":"PASS"}'
