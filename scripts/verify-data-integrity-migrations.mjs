import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('supabase/migrations');
const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
assert(files.length > 0, 'No Supabase migrations found.');
const migrations = files.map(file => ({ file, sql: fs.readFileSync(path.join(directory, file), 'utf8') }));
const latest = migrations.find(item => item.file === '202608260001_zero_silent_data_loss.sql');
const nativeEvents = migrations.find(item => item.file === '202608290001_native_task_events.sql');
const transportCompletion = migrations.find(item => item.file === '202608300001_complete_native_sync_transport.sql');
const telegramAuth = migrations.find(item => item.file === '202608310001_telegram_auth_state_pkce.sql');
assert(latest, 'Data-integrity migration is missing.');
assert(nativeEvents, 'Native task-event projection migration is missing.');
assert(transportCompletion, 'Native synchronization transport completion migration is missing.');
assert(telegramAuth, 'Telegram auth state PKCE migration is missing.');

for (const migration of migrations) {
  const quoteCount = migration.sql.split('$$').length - 1;
  assert.equal(quoteCount % 2, 0, `${migration.file} has unbalanced dollar quotes.`);
}

// Empty-database path: every table altered by the new migration must have been
// created by an earlier migration, in lexical migration order.
const beforeLatest = migrations.filter(item => item.file < latest.file).map(item => item.sql).join('\n').toLowerCase();
for (const table of ['sync_mutations', 'tasks', 'sync_conflicts', 'sync_records', 'daily_plans']) {
  assert(
    beforeLatest.includes(`create table if not exists public.${table}`),
    `Empty-database migration path does not create ${table} before it is changed.`
  );
}

// Current-schema path: schema changes are additive/idempotent. Function bodies
// are stripped before checking top-level destructive DDL/DML; DELETE is allowed
// only inside the explicitly invoked transactional restore function.
const withoutBodies = latest.sql.replace(/\$\$[\s\S]*?\$\$/g, '$$BODY$$').toLowerCase();
for (const forbidden of [
  /\bdrop\s+table\b/,
  /\btruncate\b/,
  /\bdrop\s+column\b/,
  /\balter\s+column\s+[^;]+\s+type\b/,
  /\bdelete\s+from\b/
]) {
  assert(!forbidden.test(withoutBodies), `Top-level destructive migration statement matched ${forbidden}.`);
}
const addColumnClauses = latest.sql.match(/add\s+column(?:\s+if\s+not\s+exists)?/gi) ?? [];
assert(addColumnClauses.length >= 5, 'Expected additive data-integrity columns are missing.');
assert(addColumnClauses.every(clause => /if\s+not\s+exists/i.test(clause)), 'Every added production column must be idempotent.');

for (const required of [
  'create or replace function public.push_sync_mutation_v2',
  'create or replace function public.goalflow_sync_protocol_version',
  'create or replace function public.export_goalflow_backup',
  'create or replace function public.restore_goalflow_backup',
  'create or replace function public.project_goalflow_daily_plan_sync',
  'create or replace function public.mirror_goalflow_daily_plan_to_sync',
  'create or replace function public.goalflow_create_task_idempotent',
  'create or replace function public.goalflow_confirm_plan_idempotent',
  'create table if not exists public.api_mutation_receipts'
]) {
  assert(latest.sql.toLowerCase().includes(required), `Required migration object is missing: ${required}`);
}

assert(
  latest.sql.includes('select 3;') && latest.sql.includes('target_resolves_conflict_id uuid'),
  'Protocol v3 and transactional conflict resolution are not both present.'
);
assert(
  latest.sql.includes('pre_restore_sync_records')
    && latest.sql.includes("'server-restore'")
    && latest.sql.includes('goalflow_next_change_version()')
    && latest.sql.includes('previous.payload is distinct from current_record.payload'),
  'Restore does not visibly rebase restored records and tombstones beyond old cursors.'
);
assert(
  !/delete\s+from\s+public\.(sync_mutations|api_mutation_receipts)/i.test(
    latest.sql.match(/create or replace function public\.restore_goalflow_backup[\s\S]*?\$\$;/i)?.[0] ?? ''
  ),
  'Restore must not erase append-only idempotency evidence.'
);

const receiptTypePosition = latest.sql.indexOf('create table if not exists public.api_mutation_receipts');
const restorePosition = latest.sql.indexOf('create or replace function public.restore_goalflow_backup');
assert(receiptTypePosition >= 0 && receiptTypePosition < restorePosition, 'Restore function is created before its receipt row type.');

assert(
  nativeEvents.sql.includes('project_goalflow_task_event_sync')
    && nativeEvents.sql.includes("new.entity_type <> 'task_events'")
    && nativeEvents.sql.includes('Task event identity is already used for different history'),
  'Native task-event projection is not append-only and identity-safe.'
);
assert(
  transportCompletion.sql.includes("'daily_plans'',''task_events''")
    && transportCompletion.sql.includes('Protocol-v3 synchronization RPC has an unexpected validation body')
    && transportCompletion.sql.includes("jsonb_typeof(record.payload) = 'object'")
    && transportCompletion.sql.includes("'trueNorthGoalId', task_row.true_north_goal_id")
    && transportCompletion.sql.includes('mirror_goalflow_task_event_to_sync')
    && transportCompletion.sql.includes('pg_trigger_depth() > 1'),
  'Native event transport or lossless canonical payload preservation is incomplete.'
);

process.stdout.write(JSON.stringify({
  status: 'PASS',
  migrations: files.length,
  emptySchemaOrder: 'PASS',
  existingSchemaAdditiveSafety: 'PASS',
  note: 'Static verification only; PostgreSQL execution still requires a live/staging Supabase drill.'
}) + '\n');
