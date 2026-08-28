import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('supabase/migrations');
const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
assert(files.length > 0, 'No Supabase migrations found.');
const migrations = files.map(file => ({ file, sql: fs.readFileSync(path.join(directory, file), 'utf8') }));
const latest = migrations.find(item => item.file === '202608260001_zero_silent_data_loss.sql');
assert(latest, 'Data-integrity migration is missing.');

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
  'create or replace function public.push_sync_mutation',
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

const receiptTypePosition = latest.sql.indexOf('create table if not exists public.api_mutation_receipts');
const restorePosition = latest.sql.indexOf('create or replace function public.restore_goalflow_backup');
assert(receiptTypePosition >= 0 && receiptTypePosition < restorePosition, 'Restore function is created before its receipt row type.');

process.stdout.write(JSON.stringify({
  status: 'PASS',
  migrations: files.length,
  emptySchemaOrder: 'PASS',
  existingSchemaAdditiveSafety: 'PASS',
  note: 'Static verification only; PostgreSQL execution still requires a live/staging Supabase drill.'
}) + '\n');
