create sequence if not exists public.goalflow_task_revision_seq;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  notes text not null default '' check (char_length(notes) <= 10000),
  tags text[] not null default '{}',
  schedule_precision text not null check (schedule_precision in ('day', 'month')),
  scheduled_for date not null,
  scheduled_time time,
  planned_order integer not null default 0,
  status text not null default 'open'
    check (status in ('open', 'completed', 'broken_down', 'dropped', 'archived')),
  completed_at timestamptz,
  is_frog boolean not null default false,
  frog_failures integer not null default 0 check (frog_failures >= 0),
  before_frog boolean not null default false,
  source text not null default 'manual'
    check (source in ('manual', 'habit', 'telegram', 'share', 'ai', 'migration')),
  parent_task_id uuid references public.tasks(id) on delete set null,
  habit_id uuid,
  estimated_minutes integer not null default 25 check (estimated_minutes between 1 and 1440),
  goal_id uuid,
  true_north_goal_id uuid,
  legacy_entity_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default nextval('public.goalflow_task_revision_seq'),
  check (schedule_precision = 'day' or scheduled_time is null),
  check (schedule_precision = 'day' or extract(day from scheduled_for) = 1),
  check (not before_frog or habit_id is not null),
  check ((status = 'completed') = (completed_at is not null))
);

create unique index if not exists tasks_user_legacy_entity_idx
  on public.tasks (user_id, legacy_entity_id)
  where legacy_entity_id is not null;
create unique index if not exists tasks_habit_day_idx
  on public.tasks (user_id, habit_id, scheduled_for)
  where habit_id is not null and deleted_at is null;
create index if not exists tasks_current_queue_idx
  on public.tasks (user_id, scheduled_for, status, before_frog desc, is_frog desc, planned_order)
  where deleted_at is null;
create index if not exists tasks_revision_idx
  on public.tasks (user_id, revision);

create table if not exists public.daily_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  task_ids uuid[] not null default '{}',
  confirmed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  revision bigint not null default nextval('public.goalflow_task_revision_seq'),
  primary key (user_id, local_date)
);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'completed', 'skipped', 'rescheduled', 'promoted_to_frog',
    'broken_down', 'dropped', 'restored'
  )),
  local_date date not null default current_date,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists task_events_user_created_idx
  on public.task_events (user_id, created_at desc);

create table if not exists public.telegram_identities (
  telegram_user_id bigint primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  telegram_username text,
  telegram_chat_id bigint,
  bot_access_granted boolean not null default false,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_updates (
  update_id bigint primary key,
  telegram_user_id bigint,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text not null default 'received',
  error_code text
);

create table if not exists public.telegram_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  invite_id uuid not null references public.invite_codes(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'used', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.telegram_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_chat_id bigint not null,
  kind text not null check (kind in ('text', 'voice')),
  title text not null check (char_length(trim(title)) between 1 and 240),
  transcript text,
  schedule_precision text not null default 'day' check (schedule_precision in ('day', 'month')),
  scheduled_for date not null,
  state text not null default 'pending' check (state in ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_captures_pending_idx
  on public.telegram_captures (telegram_chat_id, state, expires_at);

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'full_beta' check (plan in ('full_beta')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  mutation_id uuid not null,
  base_server_version bigint,
  server_version bigint not null,
  local_payload jsonb not null,
  server_payload jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, mutation_id)
);

create table if not exists public.backup_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  backup_kind text not null check (backup_kind in ('daily', 'weekly')),
  checksum text not null check (length(checksum) = 64),
  byte_size bigint not null check (byte_size > 0),
  status text not null default 'complete' check (status in ('complete', 'failed', 'deleted')),
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('goalflow-backups', 'goalflow-backups', false, 52428800)
on conflict (id) do update set public = false;

create or replace function public.validate_goalflow_task_schedule()
returns trigger
language plpgsql
as $$
begin
  if new.schedule_precision = 'month' then
    if new.scheduled_for <= date_trunc('month', current_date)::date then
      raise exception using
        errcode = '22023',
        message = 'Month-only tasks must use a future month';
    end if;
    new.scheduled_time := null;
  end if;

  if tg_op = 'UPDATE' and old.is_frog and not new.is_frog then
    raise exception using errcode = '22023', message = 'A frog cannot be unmarked';
  end if;

  if tg_op = 'UPDATE' and old.status = 'open' and new.status = 'open'
    and new.scheduled_for > old.scheduled_for then
    if old.is_frog then
      raise exception using errcode = '22023', message = 'Frogs cannot be moved forward';
    end if;
    new.frog_failures := greatest(new.frog_failures, old.frog_failures + 1);
    if new.frog_failures >= 2 then
      new.is_frog := true;
    end if;
  end if;

  if tg_op = 'UPDATE' and new is distinct from old then
    new.updated_at := now();
    new.revision := nextval('public.goalflow_task_revision_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists validate_goalflow_task_schedule_trigger on public.tasks;
create trigger validate_goalflow_task_schedule_trigger
before insert or update on public.tasks
for each row execute function public.validate_goalflow_task_schedule();

alter table public.tasks enable row level security;
alter table public.daily_plans enable row level security;
alter table public.task_events enable row level security;
alter table public.telegram_identities enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.telegram_auth_attempts enable row level security;
alter table public.telegram_captures enable row level security;
alter table public.entitlements enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.backup_metadata enable row level security;

drop policy if exists "users own scheduled tasks" on public.tasks;
create policy "users own scheduled tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users own daily plans" on public.daily_plans;
create policy "users own daily plans" on public.daily_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users read own task events" on public.task_events;
create policy "users read own task events" on public.task_events
  for select using (auth.uid() = user_id);
drop policy if exists "users read own telegram identity" on public.telegram_identities;
create policy "users read own telegram identity" on public.telegram_identities
  for select using (auth.uid() = user_id);
drop policy if exists "users read own pending captures" on public.telegram_captures;
create policy "users read own pending captures" on public.telegram_captures
  for select using (auth.uid() = user_id);
drop policy if exists "users read own free entitlement" on public.entitlements;
create policy "users read own free entitlement" on public.entitlements
  for select using (auth.uid() = user_id);
drop policy if exists "users own sync conflicts" on public.sync_conflicts;
create policy "users own sync conflicts" on public.sync_conflicts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users read own backup metadata" on public.backup_metadata;
create policy "users read own backup metadata" on public.backup_metadata
  for select using (auth.uid() = user_id);

revoke all on public.telegram_updates from anon, authenticated;
revoke all on public.telegram_auth_attempts from anon, authenticated;
revoke all on public.sync_conflicts from anon, authenticated;
revoke insert, update, delete on public.backup_metadata from anon, authenticated;
revoke all on public.telegram_captures from anon, authenticated;
revoke insert, update, delete on public.telegram_identities from anon, authenticated;
revoke insert, update, delete on public.task_events from anon, authenticated;

create or replace function public.push_sync_mutation(
  target_user_id uuid,
  target_mutation_id uuid,
  target_device_id text,
  target_entity_type text,
  target_entity_id text,
  target_base_server_version bigint,
  target_version integer,
  target_payload jsonb,
  target_updated_at timestamptz,
  target_deleted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_record public.sync_records%rowtype;
  existing_mutation public.sync_mutations%rowtype;
  next_server_version bigint;
begin
  select * into existing_mutation from public.sync_mutations
  where user_id = target_user_id and mutation_id = target_mutation_id;
  if found then
    select * into existing_record from public.sync_records
    where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id;
    return jsonb_build_object('accepted', existing_mutation.accepted, 'serverVersion', existing_mutation.server_version, 'record', to_jsonb(existing_record));
  end if;

  select * into existing_record from public.sync_records
  where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id
  for update;
  if found and target_base_server_version is distinct from existing_record.server_version then
    insert into public.sync_conflicts (user_id, entity_type, entity_id, mutation_id, base_server_version, server_version, local_payload, server_payload)
    values (target_user_id, target_entity_type, target_entity_id, target_mutation_id, target_base_server_version, existing_record.server_version, target_payload, existing_record.payload)
    on conflict (user_id, mutation_id) do nothing;
    insert into public.sync_mutations (user_id, mutation_id, device_id, server_version, accepted)
    values (target_user_id, target_mutation_id, target_device_id, existing_record.server_version, false);
    return jsonb_build_object('accepted', false, 'serverVersion', existing_record.server_version, 'record', to_jsonb(existing_record));
  end if;

  next_server_version := nextval('public.goalflow_change_seq');
  insert into public.sync_records (user_id, entity_type, entity_id, version, server_version, device_id, payload, updated_at, deleted_at)
  values (target_user_id, target_entity_type, target_entity_id, target_version, next_server_version, target_device_id, target_payload, target_updated_at, target_deleted_at)
  on conflict (user_id, entity_type, entity_id) do update set
    version = excluded.version,
    server_version = excluded.server_version,
    device_id = excluded.device_id,
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;
  insert into public.sync_mutations (user_id, mutation_id, device_id, server_version, accepted)
  values (target_user_id, target_mutation_id, target_device_id, next_server_version, true);
  update public.sync_conflicts set resolved_at = now()
  where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id and resolved_at is null;
  select * into existing_record from public.sync_records
  where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id;
  return jsonb_build_object('accepted', true, 'serverVersion', next_server_version, 'record', to_jsonb(existing_record));
end;
$$;
revoke all on function public.push_sync_mutation(uuid, uuid, text, text, text, bigint, integer, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.push_sync_mutation(uuid, uuid, text, text, text, bigint, integer, jsonb, timestamptz, timestamptz) to service_role;

create or replace function public.goalflow_skip_task(
  target_user_id uuid,
  target_task_id uuid,
  target_day date
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  current_task public.tasks%rowtype;
  next_order integer;
begin
  select * into current_task from public.tasks
  where id = target_task_id and user_id = target_user_id and status = 'open' and deleted_at is null
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
  if current_task.is_frog then raise exception using errcode = '22023', message = 'A frog cannot be skipped'; end if;
  if current_task.schedule_precision <> 'day' or current_task.scheduled_for <> target_day then
    raise exception using errcode = '22023', message = 'Only a task in today''s queue can be skipped';
  end if;

  select coalesce(max(planned_order), 0) + 1 into next_order from public.tasks
  where user_id = target_user_id and scheduled_for = target_day and status = 'open' and deleted_at is null;

  update public.tasks set planned_order = next_order where id = target_task_id returning * into current_task;
  insert into public.task_events (user_id, task_id, event_type, local_date)
  values (target_user_id, target_task_id, 'skipped', target_day);
  return current_task;
end;
$$;

create or replace function public.goalflow_break_down_task(
  target_user_id uuid,
  target_task_id uuid,
  child_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.tasks%rowtype;
  child jsonb;
  created_ids uuid[] := '{}';
  child_id uuid;
begin
  if jsonb_typeof(child_tasks) <> 'array' or jsonb_array_length(child_tasks) = 0 then
    raise exception using errcode = '22023', message = 'At least one child task is required';
  end if;
  select * into parent from public.tasks
  where id = target_task_id and user_id = target_user_id and status = 'open' and deleted_at is null
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;

  for child in select value from jsonb_array_elements(child_tasks)
  loop
    insert into public.tasks (
      user_id, title, notes, tags, schedule_precision, scheduled_for, scheduled_time,
      planned_order, source, parent_task_id, estimated_minutes
    ) values (
      target_user_id,
      trim(child->>'title'),
      coalesce(child->>'notes', ''),
      array(select jsonb_array_elements_text(coalesce(child->'tags', '[]'::jsonb))),
      child->>'schedulePrecision',
      case when child->>'schedulePrecision' = 'month'
        then to_date((child->>'scheduledFor') || '-01', 'YYYY-MM-DD')
        else (child->>'scheduledFor')::date end,
      nullif(child->>'scheduledTime', '')::time,
      coalesce((child->>'plannedOrder')::integer, parent.planned_order),
      coalesce(child->>'source', 'manual'),
      parent.id,
      coalesce((child->>'estimatedMinutes')::integer, parent.estimated_minutes)
    ) returning id into child_id;
    created_ids := array_append(created_ids, child_id);
    insert into public.task_events (user_id, task_id, event_type, metadata)
    values (target_user_id, child_id, 'created', jsonb_build_object('parentTaskId', parent.id));
  end loop;

  update public.tasks set status = 'broken_down' where id = parent.id;
  insert into public.task_events (user_id, task_id, event_type, metadata)
  values (target_user_id, parent.id, 'broken_down', jsonb_build_object('childTaskIds', created_ids));
  return jsonb_build_object('parentTaskId', parent.id, 'childTaskIds', created_ids);
end;
$$;

create or replace function public.goalflow_reschedule_task(
  target_user_id uuid,
  target_task_id uuid,
  target_local_date date,
  target_schedule_precision text,
  target_scheduled_for date,
  target_scheduled_time time
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare updated_task public.tasks%rowtype;
begin
  update public.tasks set
    schedule_precision = target_schedule_precision,
    scheduled_for = target_scheduled_for,
    scheduled_time = target_scheduled_time,
    planned_order = 0
  where id = target_task_id and user_id = target_user_id and status = 'open' and deleted_at is null
  returning * into updated_task;
  if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
  insert into public.task_events (user_id, task_id, event_type, local_date, metadata)
  values (target_user_id, target_task_id, case when updated_task.is_frog and updated_task.frog_failures >= 2 then 'promoted_to_frog' else 'rescheduled' end, target_local_date,
    jsonb_build_object('schedulePrecision', target_schedule_precision, 'scheduledFor', target_scheduled_for));
  return updated_task;
end;
$$;

create or replace function public.goalflow_complete_task(target_user_id uuid, target_task_id uuid, target_local_date date)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare updated_task public.tasks%rowtype;
begin
  update public.tasks set status = 'completed', completed_at = now()
  where id = target_task_id and user_id = target_user_id and status = 'open' and deleted_at is null
  returning * into updated_task;
  if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
  insert into public.task_events (user_id, task_id, event_type, local_date) values (target_user_id, target_task_id, 'completed', target_local_date);
  return updated_task;
end;
$$;

create or replace function public.goalflow_drop_task(target_user_id uuid, target_task_id uuid, target_local_date date)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare updated_task public.tasks%rowtype;
begin
  update public.tasks set status = 'dropped'
  where id = target_task_id and user_id = target_user_id and status = 'open' and deleted_at is null
  returning * into updated_task;
  if not found then raise exception using errcode = 'P0002', message = 'Task not found'; end if;
  insert into public.task_events (user_id, task_id, event_type, local_date) values (target_user_id, target_task_id, 'dropped', target_local_date);
  return updated_task;
end;
$$;

revoke all on function public.goalflow_skip_task(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.goalflow_break_down_task(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.goalflow_reschedule_task(uuid, uuid, date, text, date, time) from public, anon, authenticated;
revoke all on function public.goalflow_complete_task(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.goalflow_drop_task(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.goalflow_skip_task(uuid, uuid, date) to service_role;
grant execute on function public.goalflow_break_down_task(uuid, uuid, jsonb) to service_role;
grant execute on function public.goalflow_reschedule_task(uuid, uuid, date, text, date, time) to service_role;
grant execute on function public.goalflow_complete_task(uuid, uuid, date) to service_role;
grant execute on function public.goalflow_drop_task(uuid, uuid, date) to service_role;

create or replace function public.activate_telegram_beta(
  target_token_hash text,
  target_user_id uuid,
  target_telegram_user_id bigint,
  target_telegram_username text,
  target_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.telegram_auth_attempts%rowtype;
  invite public.invite_codes%rowtype;
  identity_email text;
begin
  select * into attempt from public.telegram_auth_attempts
  where token_hash = target_token_hash and state = 'pending' and expires_at > now()
  for update;
  if not found then return false; end if;
  select * into invite from public.invite_codes
  where id = attempt.invite_id and disabled_at is null and expires_at > now() and use_count < max_uses
  for update;
  if not found then return false; end if;

  identity_email := lower(coalesce(nullif(target_email, ''), 'telegram-' || target_telegram_user_id || '@users.goalflow.invalid'));
  insert into public.invite_redemptions (invite_id, email, auth_user_id)
  values (invite.id, identity_email, target_user_id) on conflict do nothing;
  if not found then return false; end if;

  update public.invite_codes set use_count = use_count + 1 where id = invite.id;
  insert into public.profiles (user_id, email, role, status, invited_by)
  values (target_user_id, identity_email, 'beta', 'active', invite.created_by)
  on conflict (user_id) do update set status = 'active', updated_at = now();
  insert into public.telegram_identities (telegram_user_id, user_id, telegram_username, bot_access_granted)
  values (target_telegram_user_id, target_user_id, nullif(target_telegram_username, ''), true)
  on conflict (user_id) do update set
    telegram_user_id = excluded.telegram_user_id,
    telegram_username = excluded.telegram_username,
    bot_access_granted = true,
    updated_at = now();
  insert into public.entitlements (user_id, plan, active) values (target_user_id, 'full_beta', true)
  on conflict (user_id) do update set active = true, updated_at = now();
  update public.telegram_auth_attempts set state = 'used', used_at = now() where id = attempt.id;
  return true;
end;
$$;

revoke all on function public.activate_telegram_beta(text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.activate_telegram_beta(text, uuid, bigint, text, text) to service_role;

insert into public.tasks (
  user_id, title, notes, tags, schedule_precision, scheduled_for, planned_order,
  status, completed_at, is_frog, frog_failures, before_frog, source, habit_id,
  estimated_minutes, legacy_entity_id, created_at, updated_at, deleted_at
)
select
  records.user_id,
  left(coalesce(nullif(trim(records.payload->>'title'), ''), 'Untitled task'), 240),
  left(coalesce(records.payload->>'notes', ''), 10000),
  array(select jsonb_array_elements_text(coalesce(records.payload->'hashtags', '[]'::jsonb))),
  'day',
  coalesce(records.payload->>'localDate', records.payload->>'dateAssigned')::date,
  coalesce((records.payload->>'plannedOrder')::integer, 0),
  case records.payload->>'status'
    when 'completed' then 'completed'
    when 'archived' then 'archived'
    else 'open'
  end,
  case when records.payload->>'status' = 'completed'
    then coalesce((records.payload->>'completedAt')::timestamptz, records.updated_at)
    else null end,
  coalesce((records.payload->>'isFrog')::boolean, false),
  coalesce((records.payload->>'frogFailures')::integer, (records.payload->>'rescheduleCount')::integer, 0),
  false,
  'migration',
  case when coalesce(records.payload->>'habitId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (records.payload->>'habitId')::uuid else null end,
  greatest(1, least(1440, coalesce((records.payload->>'estimatedMinutes')::integer, 25))),
  records.entity_id,
  coalesce((records.payload->>'createdAt')::timestamptz, records.updated_at),
  records.updated_at,
  records.deleted_at
from public.sync_records records
where records.entity_type = 'task'
  and coalesce(records.payload->>'localDate', records.payload->>'dateAssigned') ~ '^\d{4}-\d{2}-\d{2}$'
on conflict (user_id, legacy_entity_id) where legacy_entity_id is not null do nothing;

insert into public.entitlements (user_id, plan, active)
select user_id, 'full_beta', true from public.profiles
where status = 'active'
on conflict (user_id) do update set active = true, updated_at = now();
