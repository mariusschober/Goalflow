-- Forward-only backup protocol v2: per-user encrypted envelopes are recorded,
-- user AI usage is included, and restores gain a non-mutating validation RPC.

begin;

alter table public.backup_metadata
  drop constraint if exists backup_metadata_backup_kind_check;
alter table public.backup_metadata
  add constraint backup_metadata_backup_kind_check
  check (backup_kind in ('daily', 'weekly', 'pre-restore'));

alter table public.backup_metadata
  add column if not exists encryption_version smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.backup_metadata'::regclass
      and conname = 'backup_metadata_encryption_version_check'
  ) then
    alter table public.backup_metadata
      add constraint backup_metadata_encryption_version_check
      check (encryption_version in (1, 2)) not valid;
  end if;
end;
$$;

alter table public.backup_metadata
  validate constraint backup_metadata_encryption_version_check;

create or replace function public.goalflow_backup_protocol_version()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$ select 2; $$;

-- One SQL statement provides a coherent snapshot. Operational/security ledgers
-- (backup metadata, invite redemption, and pending auth attempts) intentionally
-- remain outside a user data restore so recovery cannot rewind access controls.
create or replace function public.export_goalflow_backup(target_user_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(row_to_json(value)) from public.profiles value where value.user_id = target_user_id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(row_to_json(value)) from public.tasks value where value.user_id = target_user_id), '[]'::jsonb),
    'daily_plans', coalesce((select jsonb_agg(row_to_json(value)) from public.daily_plans value where value.user_id = target_user_id), '[]'::jsonb),
    'task_events', coalesce((select jsonb_agg(row_to_json(value)) from public.task_events value where value.user_id = target_user_id), '[]'::jsonb),
    'telegram_identities', coalesce((select jsonb_agg(row_to_json(value)) from public.telegram_identities value where value.user_id = target_user_id), '[]'::jsonb),
    'telegram_captures', coalesce((select jsonb_agg(row_to_json(value)) from public.telegram_captures value where value.user_id = target_user_id), '[]'::jsonb),
    'telegram_updates', coalesce((select jsonb_agg(row_to_json(value)) from public.telegram_updates value where value.telegram_user_id in (
      select identity.telegram_user_id from public.telegram_identities identity where identity.user_id = target_user_id
    )), '[]'::jsonb),
    'sync_records', coalesce((select jsonb_agg(row_to_json(value)) from public.sync_records value where value.user_id = target_user_id), '[]'::jsonb),
    'sync_mutations', coalesce((select jsonb_agg(row_to_json(value)) from public.sync_mutations value where value.user_id = target_user_id), '[]'::jsonb),
    'sync_conflicts', coalesce((select jsonb_agg(row_to_json(value)) from public.sync_conflicts value where value.user_id = target_user_id), '[]'::jsonb),
    'api_mutation_receipts', coalesce((select jsonb_agg(row_to_json(value)) from public.api_mutation_receipts value where value.user_id = target_user_id), '[]'::jsonb),
    'entitlements', coalesce((select jsonb_agg(row_to_json(value)) from public.entitlements value where value.user_id = target_user_id), '[]'::jsonb),
    'ai_usage', coalesce((select jsonb_agg(row_to_json(value)) from public.ai_usage value where value.user_id = target_user_id), '[]'::jsonb)
  );
$$;

create or replace function public.validate_goalflow_backup_v2(
  target_user_id uuid,
  backup_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  collections jsonb;
  collection_name text;
  legacy_usage_state_missing boolean := false;
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception using errcode = 'P0002', message = 'Restore target auth user does not exist';
  end if;
  if backup_payload is null or jsonb_typeof(backup_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Backup payload is invalid';
  end if;
  if backup_payload ? 'userId'
    and coalesce(backup_payload->>'userId', '') <> target_user_id::text then
    raise exception using errcode = '42501', message = 'Backup owner does not match restore target';
  end if;

  collections := case
    when jsonb_typeof(backup_payload->'collections') = 'object' then backup_payload->'collections'
    else backup_payload
  end;
  if collections is null or jsonb_typeof(collections) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Backup collections are invalid';
  end if;
  foreach collection_name in array array[
    'telegram_captures','telegram_updates','sync_mutations','sync_conflicts','api_mutation_receipts','ai_usage'
  ] loop
    if not (collections ? collection_name) then
      collections := collections || jsonb_build_object(collection_name, '[]'::jsonb);
      if collection_name = 'ai_usage' then legacy_usage_state_missing := true; end if;
    end if;
  end loop;

  foreach collection_name in array array[
    'profiles','tasks','daily_plans','task_events','telegram_identities','telegram_captures',
    'telegram_updates','sync_records','sync_mutations','sync_conflicts','api_mutation_receipts',
    'entitlements','ai_usage'
  ] loop
    if jsonb_typeof(collections->collection_name) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Backup collection is missing or invalid: ' || collection_name;
    end if;
    if collection_name <> 'telegram_updates' and exists (
      select 1 from jsonb_array_elements(collections->collection_name) value
      where coalesce(value->>'user_id', '') <> target_user_id::text
    ) then
      raise exception using errcode = '42501', message = 'Backup contains data owned by a different user';
    end if;
  end loop;

  if jsonb_array_length(collections->'profiles') <> 1 then
    raise exception using errcode = '22023', message = 'Backup must contain exactly one profile';
  end if;
  if exists (
    select 1 from jsonb_array_elements(collections->'telegram_updates') update_row
    where coalesce(update_row->>'telegram_user_id', '') not in (
      select identity_row->>'telegram_user_id'
      from jsonb_array_elements(collections->'telegram_identities') identity_row
    )
  ) then
    raise exception using errcode = '42501', message = 'Backup contains Telegram updates outside the restored identity';
  end if;

  -- Force PostgreSQL to parse every row into the exact installed table type.
  -- The destructive RPC remains the final constraint/FK check and is atomic.
  perform count(*) from jsonb_populate_recordset(null::public.profiles, collections->'profiles');
  perform count(*) from jsonb_populate_recordset(null::public.tasks, collections->'tasks');
  perform count(*) from jsonb_populate_recordset(null::public.daily_plans, collections->'daily_plans');
  perform count(*) from jsonb_populate_recordset(null::public.task_events, collections->'task_events');
  perform count(*) from jsonb_populate_recordset(null::public.telegram_identities, collections->'telegram_identities');
  perform count(*) from jsonb_populate_recordset(null::public.telegram_captures, collections->'telegram_captures');
  perform count(*) from jsonb_populate_recordset(null::public.telegram_updates, collections->'telegram_updates');
  perform count(*) from jsonb_populate_recordset(null::public.sync_records, collections->'sync_records');
  perform count(*) from jsonb_populate_recordset(null::public.sync_mutations, collections->'sync_mutations');
  perform count(*) from jsonb_populate_recordset(null::public.sync_conflicts, collections->'sync_conflicts');
  perform count(*) from jsonb_populate_recordset(null::public.api_mutation_receipts, collections->'api_mutation_receipts');
  perform count(*) from jsonb_populate_recordset(null::public.entitlements, collections->'entitlements');
  perform count(*) from jsonb_populate_recordset(null::public.ai_usage, collections->'ai_usage');

  return jsonb_build_object(
    'valid', true,
    'legacyUsageStateMissing', legacy_usage_state_missing,
    'counts', jsonb_build_object(
      'profiles', jsonb_array_length(collections->'profiles'),
      'tasks', jsonb_array_length(collections->'tasks'),
      'daily_plans', jsonb_array_length(collections->'daily_plans'),
      'task_events', jsonb_array_length(collections->'task_events'),
      'telegram_identities', jsonb_array_length(collections->'telegram_identities'),
      'telegram_captures', jsonb_array_length(collections->'telegram_captures'),
      'telegram_updates', jsonb_array_length(collections->'telegram_updates'),
      'sync_records', jsonb_array_length(collections->'sync_records'),
      'sync_mutations', jsonb_array_length(collections->'sync_mutations'),
      'sync_conflicts', jsonb_array_length(collections->'sync_conflicts'),
      'api_mutation_receipts', jsonb_array_length(collections->'api_mutation_receipts'),
      'entitlements', jsonb_array_length(collections->'entitlements'),
      'ai_usage', jsonb_array_length(collections->'ai_usage')
    )
  );
end;
$$;

-- The existing restore function remains the canonical transactional data
-- replacement. This wrapper validates first and restores quota rows in that
-- same transaction without ever rewinding newer usage.
create or replace function public.restore_goalflow_backup_v2(
  target_user_id uuid,
  backup_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  validation_result jsonb;
  restore_result jsonb;
  collections jsonb;
  normalized_payload jsonb;
begin
  validation_result := public.validate_goalflow_backup_v2(target_user_id, backup_payload);
  collections := case
    when jsonb_typeof(backup_payload->'collections') = 'object' then backup_payload->'collections'
    else backup_payload
  end;
  if not (collections ? 'ai_usage') then
    collections := collections || jsonb_build_object('ai_usage', '[]'::jsonb);
  end if;
  normalized_payload := case
    when jsonb_typeof(backup_payload->'collections') = 'object'
      then jsonb_set(backup_payload, '{collections}', collections, true)
    else collections
  end;

  restore_result := public.restore_goalflow_backup(target_user_id, normalized_payload);

  insert into public.ai_usage as current_usage (user_id, usage_date, request_count)
  select target_user_id, restored.usage_date, restored.request_count
  from jsonb_populate_recordset(null::public.ai_usage, collections->'ai_usage') restored
  on conflict (user_id, usage_date) do update set
    request_count = greatest(current_usage.request_count, excluded.request_count);

  return restore_result || jsonb_build_object(
    'backupProtocolVersion', 2,
    'aiUsageRowsPresent', jsonb_array_length(collections->'ai_usage'),
    'quotaUsageRewindPrevented', true,
    'validation', validation_result
  );
end;
$$;

revoke all on function public.goalflow_backup_protocol_version()
from public, anon, authenticated, service_role;
revoke all on function public.export_goalflow_backup(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.validate_goalflow_backup_v2(uuid, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.restore_goalflow_backup_v2(uuid, jsonb)
from public, anon, authenticated, service_role;
-- The legacy function had SQL-null validation gaps. Keep it as a private
-- implementation detail callable by the security-definer v2 wrapper only.
revoke all on function public.restore_goalflow_backup(uuid, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.goalflow_backup_protocol_version() to service_role;
grant execute on function public.export_goalflow_backup(uuid) to service_role;
grant execute on function public.validate_goalflow_backup_v2(uuid, jsonb) to service_role;
grant execute on function public.restore_goalflow_backup_v2(uuid, jsonb) to service_role;

commit;
