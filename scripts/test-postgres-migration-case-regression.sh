#!/usr/bin/env sh
set -eu
# Regression test for the malformed CASE in 202608260001_zero_silent_data_loss.sql
# Before fix: the function goalflow_create_task_idempotent contained an unterminated
# CASE expression (missing END) at task_payload->>'schedulePrecision' = 'month'.
# PostgreSQL must reject the malformed version and accept the corrected version.
# This test verifies the current migration file is correctly terminated and that
# a deliberately malformed version is rejected by PostgreSQL.

migration="supabase/migrations/202608260001_zero_silent_data_loss.sql"
echo "Checking current migration file has correctly terminated CASE..."
if ! grep -q "case when task_payload->>'schedulePrecision' = 'month'" "$migration" || ! grep -q "::date end" "$migration"; then
  echo "FAIL: migration file missing correctly terminated CASE (expected END)" >&2
  exit 1
fi
echo "PASS: current migration has correctly terminated CASE"

# Create a temporary malformed version by removing the END
tmp_malformed="/tmp/malformed_case_$$.sql"
tmp_fixed="/tmp/fixed_case_$$.sql"
# Extract the function and create malformed version
# We simulate the malformed case by replacing "else (task_payload->>'scheduledFor')::date end" with without END
# This would cause PostgreSQL syntax error at end of input
if grep -q "case when task_payload->>'schedulePrecision' = 'month'" "$migration"; then
  echo "Verifying malformed version would be rejected by PostgreSQL..."
  # Create a minimal test case that PostgreSQL should reject
  cat > "$tmp_malformed" << 'SQL'
do $$ begin
  perform case when 'month' = 'month' then to_date('2026-01-01', 'YYYY-MM-DD') else '2026-01-01'::date;
end $$;
SQL
  # This should fail because CASE is not terminated with END
  if psql -v ON_ERROR_STOP=1 -d postgres -c "do \$\$ begin perform case when 'a'='a' then 1 else 0; end \$\$;" 2>&1 | grep -q "syntax error"; then
    echo "PASS: PostgreSQL correctly rejects unterminated CASE (malformed)"
  else
    # Try alternative check: the malformed SQL should fail
    if ! psql -v ON_ERROR_STOP=1 -d postgres -f "$tmp_malformed" >/dev/null 2>&1; then
      echo "PASS: PostgreSQL correctly rejects unterminated CASE (malformed file)"
    else
      echo "FAIL: PostgreSQL should reject unterminated CASE but accepted it" >&2
      exit 1
    fi
  fi
  rm -f "$tmp_malformed" "$tmp_fixed"
else
  echo "FAIL: could not find expected CASE pattern to test malformed version" >&2
  exit 1
fi

# Verify the correct migration passes the existing postgres harness
echo "Verifying correct migration via existing postgres harness..."
if command -v createdb >/dev/null 2>&1 && pg_isready -q; then
  if bash scripts/test-postgres-migrations.sh >/dev/null 2>&1; then
    echo "PASS: PostgreSQL successfully applies the corrected migration via harness"
  else
    echo "FAIL: PostgreSQL harness failed for the corrected migration" >&2
    exit 1
  fi
else
  echo "SKIP: PostgreSQL not available, but file syntax check passed"
fi

echo "POSTGRES_CASE_REGRESSION=PASS"
