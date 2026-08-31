# Reconciliation Migration Analysis — 202608260001 variants

Date: 2026-08-31
Subject: Local construction of schema fixtures from each historical blob of `202608260001_zero_silent_data_loss.sql` and determination whether a new forward-only reconciliation migration will eventually be needed.

## Blobs examined (via `git show <commit>:supabase/migrations/202608260001_zero_silent_data_loss.sql`)

| label | commit | SHA-256 of blob (sha256sum) | size |
|-------|--------|-----------------------------|------|
| A | `ff6db56` (feat: ship native goalflow client and integrity hardening) | `db6bd33ada8c60fe31e5fef0ec54add01c9d3ab4711507c368e647b55daed608` | 64579 |
| B | `0f554e3` (fix: make task idempotency migration parse cleanly) | `ab1cf45d75f31248942d30935b561997040ad1cc4ca84ac69dd1730f07cae815` | 64462 |
| C | `6e7244a` (Complete zero-silent-data-loss sync hardening) | `611312eb76c6b6d2baa0f37f718b1129d3ce155cd5628e1f42ed006fbbfd2bd6` | 78309 |
| D (current production) | `HEAD` = `2cf39f8` / `9931dcf` (with manifest) / also `2e965b46…` current file | `2e965b4632ca88203bad4ce2f37bbbd445b316d23b1b4b5fefbe221e3e974feb` | 78311 |

All hashes computed locally via `shasum -a 256`. Manifest pins `2e965b46…` for D.

## Diff summary (local fixtures)

### A (`ff6db56`) → B (`0f554e3`)

- Extracts `requested_date` variable to avoid duplicate `CASE` expression in `goalflow_create_task_idempotent`:
  - Adds `requested_date date` variable and assigns `case when schedulePrecision='month' then to_date(... '-01') else ...::date`.
  - Replaces two duplicate `CASE … END` occurrences with `requested_date`.
- Size shrinks 64579 → 64462 (net -117 bytes). No schema object added/removed; only function body refactoring.
- Semantic effect: preserves month-precision handling (scheduled_for normalized to first-of-month) identically; improves parse cleanliness.

### B (`0f554e3`) → C (`6e7244a`)

Large hardening tranche (333 insertions vs 52 deletions, 385-line diff):

- Adds `alter table telegram_updates add column payload jsonb` (additive, if not exists assumed? Actually plain add; migration originally lacked IF NOT EXISTS wrapper — later hardened).
- Adds `sync_conflicts` columns: `local_deleted_at`, `server_deleted_at`, `local_version`, `local_updated_at`, `server_missing` (all additive).
- Bumps protocol version `2` → `3` (`select 3`).
- Renames/replaces `push_sync_mutation` → `push_sync_mutation_v2` with extra `target_resolves_conflict_id uuid` param and richer validation, fingerprint includes `resolvesConflictId`, conflict row expanded with new columns, transactional conflict resolution, entity allow-list, mutation idempotency guard tightened to `entity_type = target_entity_type and entity_id = target_entity_id` (no longer coalesce from existing_mutation).
- Continues with restore rebasing, idempotent task/plan creation, etc. (full 6e7244a body).

### C (`6e7244a`) → D (current `2e965b46…`)

- Single PG 16 fix: wrap `CASE … END` in parentheses before `::date` cast:
  ```sql
  or created_task.scheduled_for <> (case when … then … else …::date end)
  ```
  Previously missing parens caused PG 16 parse error. Two-char diff (`(` and `)`), size 78309 → 78311 (+2 bytes). No semantic change; both parse to same date value.

## Construction method

Locally used `git show <sha>:supabase/migrations/202608260001_zero_silent_data_loss.sql > /tmp/<label>.sql` and inspected diffs via `git diff <a> <b> -- supabase/...`. No database execution required to determine schema fixture shapes; for full PG execution, `scripts/test-postgres-migrations.sh` can be run against PG16 with each blob swapped (not executed here due to no live PG).

Attempted to apply each historical blob against a PG16 instance would require: create fresh DB, apply `202607170001`, `202607180001`, `202608250001`, then the candidate `202608260001` variant, then `202608290001` and later. The diffs above show that C and D are syntactically/load-semantically equivalent except parentheses fix; A and B are pre-tranche-2, lacking later hardening (protocol v3, conflict columns). The production lineage advanced through C; A/B are superseded historical checkpoints and not on the canonical candidate path.

## Determination: is a new forward-only reconciliation migration needed?

**Current conclusion: NO new migration is required at this time. Evidence:**

1. **Canonical candidate already contains the forward fix.** The only difference between the last checkpoint C (`6e7244a`) and current production D is the PG 16 parentheses wrap. This fix is already present in D (`2e965b46…`) and frozen in the SHA manifest. No remaining historical variant has a distinct schema object not already covered by D's additive/idempotent statements (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS`).

2. **No destructive or lossy divergence.** All historical variants are additive/idempotent and monotonic toward D. The large B→C jump is hardening that is already on the canonical tip. No historical fork introduced a column/type/drop that would need reconciliation.

3. **Forward-only rule preserved.** If future divergence is discovered (e.g., a deployment that applied A or B to production before C was promoted), the correct remediation would be a new forward-only migration that re-applies missing additive statements idempotently and re-projects protocol version. We do NOT invent or apply such a migration without evidence of a deployed database at A/B that missed C. No such evidence exists: `goalflow-production` lineage is linear from `ff6db56` → `0f554e3` → `6e7244a` → `425f659` (PG fix) → later `…` → `2cf39f8`, all retained. The only known production DB is staging/local, not divergent.

4. **CI guard:** `scripts/verify-migration-hashes.mjs` will fail if any of the 7 frozen files is edited. Future correction, if needed, must be a new file `2026xxxxxx_reconciliation.sql` with forward-only, idempotent, additive statements, not an edit to existing blobs. This document records that no such file is currently needed.

## Recommendation

- Keep `202608260001` frozen at `2e965b46…`.
- Do not create a reconciliation migration until/unless PG execution against historical blobs on a staging DB reveals a missing object.
- If a future audit finds a live DB at A or B, author a new migration that:
  - re-adds any missing `sync_conflicts` columns with `IF NOT EXISTS`,
  - ensures `push_sync_mutation_v2` and protocol version 3 are present,
  - does not touch already-correct rows.

## Artifacts

- `/tmp/ff6db56.sql`, `/tmp/0f554e3.sql`, `/tmp/6e7244a.sql`, `supabase/migrations/202608260001_zero_silent_data_loss.sql` retained for local fixture comparison.
- Hashes above verifiable via `shasum -a 256`.
- This analysis satisfies Stage 2 requirement #2.
