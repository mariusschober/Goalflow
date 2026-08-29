-- Forward-only, additive data-integrity hardening.
-- Existing rows are preserved. Replaced functions can be rolled back by
-- re-applying their previous definitions without removing the added columns.

alter table public.sync_mutations
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists request_hash text,
  add column if not exists result jsonb;

alter table public.tasks
  add column if not exists sync_server_version bigint;

alter table public.daily_plans
  add column if not exists sync_server_version bigint;

alter table public.telegram_updates
  add column if not exists payload jsonb;

alter table public.sync_conflicts
  add column if not exists local_deleted_at timestamptz,
  add column if not exists server_deleted_at timestamptz,
  add column if not exists local_version integer,
  add column if not exists local_updated_at timestamptz,
  add column if not exists server_missing boolean not null default false;

create index if not exists sync_mutations_entity_idx
  on public.sync_mutations (user_id, entity_type, entity_id, created_at);
create index if not exists sync_conflicts_unresolved_entity_idx
  on public.sync_conflicts (user_id, entity_type, entity_id, server_version)
  where resolved_at is null;
create index if not exists tasks_sync_server_version_idx
  on public.tasks (user_id, sync_server_version)
  where sync_server_version is not null;
create index if not exists daily_plans_sync_server_version_idx
  on public.daily_plans (user_id, sync_server_version)
  where sync_server_version is not null;

create or replace function public.goalflow_sync_protocol_version()
returns integer
language sql
immutable
set search_path = public
as $$ select 3; $$;
revoke all on function public.goalflow_sync_protocol_version() from public, anon, authenticated;
grant execute on function public.goalflow_sync_protocol_version() to service_role;

-- Sequence allocation and restore sequence repair share transaction advisory
-- locks. Without this, setval during a restore can race a nextval in another
-- request, rewind the sequence, and issue a duplicate cursor/revision.
create or replace function public.goalflow_next_change_version()
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('goalflow:change-sequence', 0));
  return nextval('public.goalflow_change_seq');
end;
$$;
create or replace function public.goalflow_next_task_revision()
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('goalflow:task-revision-sequence', 0));
  return nextval('public.goalflow_task_revision_seq');
end;
$$;
revoke all on function public.goalflow_next_change_version() from public, anon, authenticated;
revoke all on function public.goalflow_next_task_revision() from public, anon, authenticated;
alter table public.sync_records alter column server_version set default public.goalflow_next_change_version();
alter table public.tasks alter column revision set default public.goalflow_next_task_revision();
alter table public.daily_plans alter column revision set default public.goalflow_next_task_revision();

create or replace function public.goalflow_task_sync_payload(task_row public.tasks)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', coalesce(task_row.legacy_entity_id, task_row.id::text),
    'cloudId', task_row.id,
    'title', task_row.title,
    'description', task_row.notes,
    'hashtags', to_jsonb(task_row.tags),
    'schedulePrecision', task_row.schedule_precision,
    'scheduledFor', case when task_row.schedule_precision = 'month'
      then to_char(task_row.scheduled_for, 'YYYY-MM')
      else to_char(task_row.scheduled_for, 'YYYY-MM-DD') end,
    'dateAssigned', to_char(task_row.scheduled_for, 'YYYY-MM-DD'),
    'scheduledTime', case when task_row.scheduled_time is null then null else to_char(task_row.scheduled_time, 'HH24:MI') end,
    'plannedOrder', task_row.planned_order,
    'completed', task_row.status in ('completed', 'broken_down'),
    'completedAt', task_row.completed_at,
    'lifecycleStatus', task_row.status,
    'wontDo', task_row.status = 'dropped',
    'isFrog', task_row.is_frog,
    'beforeFrog', task_row.before_frog,
    'frogFailures', task_row.frog_failures,
    'source', task_row.source,
    'habitId', task_row.habit_id,
    'parentTaskId', task_row.parent_task_id,
    'goalId', task_row.goal_id,
    'duration', task_row.estimated_minutes,
    'createdAt', floor(extract(epoch from task_row.created_at) * 1000),
    'updatedAt', floor(extract(epoch from task_row.updated_at) * 1000),
    'deletedAt', task_row.deleted_at
  );
$$;

create or replace function public.project_goalflow_task_sync(
  target_user_id uuid,
  target_entity_id text,
  target_payload jsonb,
  target_server_version bigint,
  target_updated_at timestamptz,
  target_deleted_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  legacy_id text;
  candidate_id uuid;
  candidate_text text;
  existing_task public.tasks%rowtype;
  owner_id uuid;
  precision_value text;
  schedule_text text;
  schedule_date date;
  status_value text;
  completed_value text;
  completed_timestamp timestamptz;
  source_value text;
  habit_value uuid;
  goal_value uuid;
begin
  if jsonb_typeof(target_payload) = 'array' then
    for item in select value from jsonb_array_elements(target_payload)
    loop
      if jsonb_typeof(item) <> 'object' or coalesce(item->>'id', '') = '' then
        raise exception using errcode = '22023', message = 'Task snapshot contains an invalid record';
      end if;
      perform public.project_goalflow_task_sync(
        target_user_id,
        left(item->>'id', 240),
        item,
        target_server_version,
        target_updated_at,
        case when nullif(item->>'deletedAt', '') is null then null else (item->>'deletedAt')::timestamptz end
      );
    end loop;
    return;
  end if;
  if jsonb_typeof(target_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Task mutation payload must be an object or legacy array';
  end if;

  legacy_id := left(coalesce(nullif(target_payload->>'id', ''), target_entity_id), 240);
  if legacy_id = '' then raise exception using errcode = '22023', message = 'Task mutation has no identifier'; end if;
  candidate_text := coalesce(nullif(target_payload->>'cloudId', ''), legacy_id);
  existing_task := null;
  if candidate_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    candidate_id := candidate_text::uuid;
    select user_id into owner_id from public.tasks where id = candidate_id;
    if found and owner_id <> target_user_id then
      raise exception using errcode = '23505', message = 'Task identifier belongs to another user';
    end if;
    select * into existing_task from public.tasks where id = candidate_id and user_id = target_user_id for update;
  end if;
  if existing_task.id is null then
    select * into existing_task from public.tasks
    where user_id = target_user_id and legacy_entity_id = legacy_id
    for update;
  end if;
  if existing_task.id is not null and coalesce(existing_task.sync_server_version, 0) >= target_server_version then return; end if;

  perform set_config('goalflow.sync_projection', 'on', true);
  if target_deleted_at is not null then
    if existing_task.id is not null then
      update public.tasks set deleted_at = target_deleted_at, sync_server_version = target_server_version
      where id = existing_task.id and user_id = target_user_id
        and coalesce(sync_server_version, 0) < target_server_version;
    end if;
    perform set_config('goalflow.sync_projection', 'off', true);
    return;
  end if;

  if length(trim(coalesce(target_payload->>'title', ''))) = 0 then
    raise exception using errcode = '22023', message = 'Task mutation has no title';
  end if;
  precision_value := case when target_payload->>'schedulePrecision' = 'month' then 'month' else 'day' end;
  schedule_text := coalesce(nullif(target_payload->>'scheduledFor', ''), target_payload->>'dateAssigned');
  if precision_value = 'month' and schedule_text ~ '^\d{4}-\d{2}(-01)?$' then
    schedule_date := to_date(left(schedule_text, 7) || '-01', 'YYYY-MM-DD');
  elsif precision_value = 'day' and schedule_text ~ '^\d{4}-\d{2}-\d{2}$' then
    schedule_date := schedule_text::date;
  else
    raise exception using errcode = '22023', message = 'Task mutation has an invalid schedule';
  end if;
  status_value := case
    when target_payload->>'lifecycleStatus' = 'broken_down' then 'broken_down'
    when target_payload->>'lifecycleStatus' = 'archived' then 'archived'
    when coalesce((target_payload->>'wontDo')::boolean, false) or target_payload->>'lifecycleStatus' = 'dropped' then 'dropped'
    when coalesce((target_payload->>'completed')::boolean, false) or target_payload->>'lifecycleStatus' = 'completed' then 'completed'
    else 'open' end;
  completed_timestamp := null;
  if status_value = 'completed' then
    completed_value := nullif(target_payload->>'completedAt', '');
    begin
      if completed_value ~ '^\d+$' then completed_timestamp := to_timestamp(completed_value::numeric / 1000);
      else completed_timestamp := coalesce(completed_value::timestamptz, target_updated_at); end if;
    exception when others then completed_timestamp := target_updated_at;
    end;
  end if;
  source_value := case when target_payload->>'source' in ('manual','habit','telegram','share','ai','migration')
    then target_payload->>'source' else 'migration' end;
  habit_value := case when coalesce(target_payload->>'habitId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (target_payload->>'habitId')::uuid else null end;
  goal_value := case when coalesce(target_payload->>'goalId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (target_payload->>'goalId')::uuid else null end;

  insert into public.tasks (
    id, user_id, legacy_entity_id, title, notes, tags, schedule_precision, scheduled_for,
    scheduled_time, planned_order, status, completed_at, is_frog, frog_failures,
    before_frog, source, habit_id, goal_id, estimated_minutes, created_at, updated_at,
    deleted_at, sync_server_version
  ) values (
    coalesce(existing_task.id, candidate_id, gen_random_uuid()),
    target_user_id,
    case when coalesce(existing_task.id, candidate_id)::text = legacy_id then null else legacy_id end,
    left(trim(target_payload->>'title'), 240),
    left(coalesce(target_payload->>'description', target_payload->>'notes', ''), 10000),
    array(select jsonb_array_elements_text(coalesce(target_payload->'hashtags', '[]'::jsonb)) limit 20),
    precision_value,
    schedule_date,
    case when precision_value = 'day' and coalesce(target_payload->>'scheduledTime', '') ~ '^(?:[01]\d|2[0-3]):[0-5]\d$'
      then (target_payload->>'scheduledTime')::time else null end,
    greatest(0, coalesce((target_payload->>'plannedOrder')::integer, 0)),
    status_value,
    completed_timestamp,
    coalesce((target_payload->>'isFrog')::boolean, false),
    greatest(0, coalesce((target_payload->>'frogFailures')::integer, (target_payload->>'rescheduleCount')::integer, 0)),
    coalesce((target_payload->>'beforeFrog')::boolean, false) and habit_value is not null,
    source_value,
    habit_value,
    goal_value,
    greatest(1, least(1440, coalesce((target_payload->>'duration')::integer, (target_payload->>'estimatedMinutes')::integer, 25))),
    coalesce(existing_task.created_at, target_updated_at),
    target_updated_at,
    null,
    target_server_version
  )
  on conflict (id) do update set
    legacy_entity_id = excluded.legacy_entity_id,
    title = excluded.title,
    notes = excluded.notes,
    tags = excluded.tags,
    schedule_precision = excluded.schedule_precision,
    scheduled_for = excluded.scheduled_for,
    scheduled_time = excluded.scheduled_time,
    planned_order = excluded.planned_order,
    status = excluded.status,
    completed_at = excluded.completed_at,
    is_frog = excluded.is_frog,
    frog_failures = excluded.frog_failures,
    before_frog = excluded.before_frog,
    source = excluded.source,
    habit_id = excluded.habit_id,
    goal_id = excluded.goal_id,
    estimated_minutes = excluded.estimated_minutes,
    deleted_at = null,
    sync_server_version = excluded.sync_server_version
  where public.tasks.user_id = excluded.user_id
    and coalesce(public.tasks.sync_server_version, 0) < excluded.sync_server_version;
  perform set_config('goalflow.sync_projection', 'off', true);
exception when others then
  perform set_config('goalflow.sync_projection', 'off', true);
  raise;
end;
$$;

create or replace function public.mirror_goalflow_task_to_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_server_version bigint;
  sync_entity_id text;
begin
  if coalesce(current_setting('goalflow.sync_projection', true), '') = 'on' then return new; end if;
  next_server_version := public.goalflow_next_change_version();
  sync_entity_id := coalesce(new.legacy_entity_id, new.id::text);
  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id, payload, updated_at, deleted_at
  ) values (
    new.user_id, 'tasks', sync_entity_id, least(new.revision, 2147483647)::integer,
    next_server_version, 'server', public.goalflow_task_sync_payload(new), new.updated_at, new.deleted_at
  )
  on conflict (user_id, entity_type, entity_id) do update set
    version = excluded.version,
    server_version = excluded.server_version,
    device_id = excluded.device_id,
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;
  return new;
end;
$$;

drop trigger if exists mirror_goalflow_task_to_sync_trigger on public.tasks;
create trigger mirror_goalflow_task_to_sync_trigger
after insert or update on public.tasks
for each row execute function public.mirror_goalflow_task_to_sync();

create or replace function public.goalflow_daily_plan_sync_payload(plan_row public.daily_plans)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', plan_row.local_date::text,
    'localDate', plan_row.local_date::text,
    'taskIds', to_jsonb(plan_row.task_ids),
    'confirmedAt', floor(extract(epoch from plan_row.confirmed_at) * 1000)
  );
$$;

create or replace function public.project_goalflow_daily_plan_sync(
  target_user_id uuid,
  target_entity_id text,
  target_payload jsonb,
  target_server_version bigint,
  target_updated_at timestamptz,
  target_deleted_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_date date;
  payload_date text;
  confirmed_value text;
  confirmed_time timestamptz;
  planned_task_ids uuid[];
begin
  if target_entity_id !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'Daily plan mutation has an invalid date identity';
  end if;
  plan_date := target_entity_id::date;
  if plan_date::text <> target_entity_id then
    raise exception using errcode = '22023', message = 'Daily plan mutation has a non-existent local date';
  end if;
  if jsonb_typeof(target_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Daily plan mutation payload must be an object';
  end if;
  payload_date := coalesce(nullif(target_payload->>'localDate', ''), nullif(target_payload->>'id', ''), target_entity_id);
  if payload_date <> target_entity_id then
    raise exception using errcode = '22023', message = 'Daily plan identity does not match its payload';
  end if;

  perform set_config('goalflow.sync_projection', 'on', true);
  if target_deleted_at is not null then
    delete from public.daily_plans
    where user_id = target_user_id and local_date = plan_date
      and coalesce(sync_server_version, 0) < target_server_version;
    perform set_config('goalflow.sync_projection', 'off', true);
    return;
  end if;

  if jsonb_typeof(target_payload->'taskIds') <> 'array' then
    raise exception using errcode = '22023', message = 'Daily plan mutation has no task list';
  end if;
  begin
    select coalesce(array_agg(value::uuid order by position), '{}'::uuid[])
      into planned_task_ids
    from jsonb_array_elements_text(target_payload->'taskIds') with ordinality values_with_order(value, position);
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Daily plan mutation contains an invalid task identity';
  end;
  if exists (
    select 1 from unnest(planned_task_ids) planned_id
    join public.tasks task on task.id = planned_id
    where task.user_id <> target_user_id
  ) then
    raise exception using errcode = '42501', message = 'Daily plan references a task owned by another user';
  end if;
  confirmed_value := nullif(target_payload->>'confirmedAt', '');
  begin
    if confirmed_value ~ '^\d+$' then
      confirmed_time := to_timestamp(confirmed_value::numeric / 1000);
    else
      confirmed_time := confirmed_value::timestamptz;
    end if;
  exception when others then
    raise exception using errcode = '22023', message = 'Daily plan mutation has an invalid confirmation time';
  end;
  if confirmed_time is null then
    raise exception using errcode = '22023', message = 'Daily plan mutation has no confirmation time';
  end if;

  insert into public.daily_plans (
    user_id, local_date, task_ids, confirmed_at, updated_at, revision, sync_server_version
  ) values (
    target_user_id, plan_date, planned_task_ids, confirmed_time, target_updated_at,
    public.goalflow_next_task_revision(), target_server_version
  )
  on conflict (user_id, local_date) do update set
    task_ids = excluded.task_ids,
    confirmed_at = excluded.confirmed_at,
    updated_at = excluded.updated_at,
    revision = excluded.revision,
    sync_server_version = excluded.sync_server_version
  where coalesce(public.daily_plans.sync_server_version, 0) < excluded.sync_server_version;
  perform set_config('goalflow.sync_projection', 'off', true);
exception when others then
  perform set_config('goalflow.sync_projection', 'off', true);
  raise;
end;
$$;

create or replace function public.mirror_goalflow_daily_plan_to_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_server_version bigint;
begin
  if coalesce(current_setting('goalflow.sync_projection', true), '') = 'on' then return new; end if;
  next_server_version := public.goalflow_next_change_version();
  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id, payload, updated_at, deleted_at
  ) values (
    new.user_id, 'daily_plans', new.local_date::text,
    least(new.revision, 2147483647)::integer, next_server_version, 'server',
    public.goalflow_daily_plan_sync_payload(new), new.updated_at, null
  )
  on conflict (user_id, entity_type, entity_id) do update set
    version = excluded.version,
    server_version = excluded.server_version,
    device_id = excluded.device_id,
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;
  return new;
end;
$$;

drop trigger if exists mirror_goalflow_daily_plan_to_sync_trigger on public.daily_plans;
create trigger mirror_goalflow_daily_plan_to_sync_trigger
after insert or update on public.daily_plans
for each row execute function public.mirror_goalflow_daily_plan_to_sync();

create or replace function public.push_sync_mutation_v2(
  target_user_id uuid,
  target_mutation_id uuid,
  target_device_id text,
  target_entity_type text,
  target_entity_id text,
  target_base_server_version bigint,
  target_version integer,
  target_payload jsonb,
  target_updated_at timestamptz,
  target_deleted_at timestamptz,
  target_resolves_conflict_id uuid
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
  request_fingerprint text;
  response_payload jsonb;
  conflict_id uuid;
  record_existed boolean;
  legacy_guard_version bigint;
  legacy_guard_payload jsonb;
  resolution_conflict public.sync_conflicts%rowtype;
begin
  if target_entity_type not in (
    'tasks','goals','habits','stats','progress','hashtags','accountability',
    'truenorth','amalgam','tracking','circadian','settings','daily_plans'
  ) or length(target_entity_id) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'Unsupported synchronization entity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_object(
    'deviceId', target_device_id,
    'entityType', target_entity_type,
    'entityId', target_entity_id,
    'baseServerVersion', target_base_server_version,
    'version', target_version,
    'payload', target_payload,
    'updatedAt', target_updated_at,
    'deletedAt', target_deleted_at,
    'resolvesConflictId', target_resolves_conflict_id
  )::text, 'utf8'), 'sha256'), 'hex');

  select * into existing_mutation from public.sync_mutations
  where user_id = target_user_id and mutation_id = target_mutation_id;
  if found then
    -- Rows created by the pre-fingerprint protocol cannot prove which payload
    -- they acknowledged. Never consume a current client mutation based on that
    -- ambiguity: materialize both sides and require an explicit resolution.
    if existing_mutation.request_hash is null then
      select * into existing_record from public.sync_records
      where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id;
      record_existed := found;
      insert into public.sync_conflicts (
        user_id, entity_type, entity_id, mutation_id, base_server_version,
        server_version, local_payload, server_payload, local_deleted_at, server_deleted_at,
        local_version, local_updated_at, server_missing
      ) values (
        target_user_id, target_entity_type, target_entity_id, target_mutation_id,
        target_base_server_version, coalesce(existing_record.server_version, existing_mutation.server_version, 0),
        target_payload, case when record_existed then existing_record.payload else '{}'::jsonb end,
        target_deleted_at, case when record_existed then existing_record.deleted_at else null end,
        target_version, target_updated_at, not record_existed
      ) on conflict (user_id, mutation_id) do nothing
      returning id into conflict_id;
      if conflict_id is null then
        select id into conflict_id from public.sync_conflicts
        where user_id = target_user_id and mutation_id = target_mutation_id;
      end if;
      response_payload := jsonb_build_object(
        'accepted', false,
        'replayMismatch', true,
        'conflictId', conflict_id,
        'serverMissing', not record_existed,
        'serverVersion', coalesce(existing_record.server_version, existing_mutation.server_version, 0),
        'record', case when record_existed then to_jsonb(existing_record) else null end
      );
      update public.sync_mutations set
        entity_type = target_entity_type,
        entity_id = target_entity_id,
        request_hash = request_fingerprint,
        result = response_payload
      where user_id = target_user_id and mutation_id = target_mutation_id;
      return response_payload;
    end if;
    if existing_mutation.request_hash is not null and (
      existing_mutation.request_hash <> request_fingerprint
      or existing_mutation.entity_type is distinct from target_entity_type
      or existing_mutation.entity_id is distinct from target_entity_id
    ) then
      select * into existing_record from public.sync_records
      where user_id = target_user_id
        and entity_type = target_entity_type
        and entity_id = target_entity_id;
      record_existed := found;
      return jsonb_build_object(
        'accepted', false,
        'replayMismatch', true,
        'serverMissing', not record_existed,
        'serverVersion', coalesce(existing_mutation.server_version, existing_record.server_version, 0),
        'record', case when record_existed then to_jsonb(existing_record) else null end
      );
    end if;
    if existing_mutation.result is not null then return existing_mutation.result; end if;
    select * into existing_record from public.sync_records
    where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id;
    response_payload := jsonb_build_object(
      'accepted', existing_mutation.accepted,
      'serverVersion', existing_mutation.server_version,
      'record', to_jsonb(existing_record)
    );
    update public.sync_mutations set
      entity_type = coalesce(entity_type, target_entity_type),
      entity_id = coalesce(entity_id, target_entity_id),
      request_hash = coalesce(request_hash, request_fingerprint),
      result = response_payload
    where user_id = target_user_id and mutation_id = target_mutation_id;
    return response_payload;
  end if;

  if target_resolves_conflict_id is not null then
    select * into resolution_conflict from public.sync_conflicts
    where id = target_resolves_conflict_id
      and user_id = target_user_id
      and entity_type = target_entity_type
      and entity_id = target_entity_id
      and resolved_at is null
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'Conflict resolution does not match an unresolved record conflict';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_entity_type || ':' || target_entity_id, 0));
  select * into existing_record from public.sync_records
  where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id
  for update;
  record_existed := found;

  if (record_existed and target_base_server_version is distinct from existing_record.server_version)
    or (record_existed and target_base_server_version = existing_record.server_version
      and target_version <= existing_record.version)
    or (not record_existed and target_base_server_version is not null) then
    if not record_existed then
      existing_record.server_version := 0;
      existing_record.payload := '{}'::jsonb;
      existing_record.deleted_at := null;
    end if;
    insert into public.sync_conflicts (
      user_id, entity_type, entity_id, mutation_id, base_server_version,
      server_version, local_payload, server_payload, local_deleted_at, server_deleted_at,
      local_version, local_updated_at, server_missing
    ) values (
      target_user_id, target_entity_type, target_entity_id, target_mutation_id,
      target_base_server_version, existing_record.server_version, target_payload, existing_record.payload,
      target_deleted_at, existing_record.deleted_at, target_version, target_updated_at, not record_existed
    ) returning id into conflict_id;
    response_payload := jsonb_build_object(
      'accepted', false,
      'conflictId', conflict_id,
      'serverMissing', not record_existed,
      'serverVersion', existing_record.server_version,
      'record', case when record_existed then to_jsonb(existing_record) else null end
    );
    insert into public.sync_mutations (
      user_id, mutation_id, device_id, server_version, accepted,
      entity_type, entity_id, request_hash, result
    ) values (
      target_user_id, target_mutation_id, target_device_id, existing_record.server_version, false,
      target_entity_type, target_entity_id, request_fingerprint, response_payload
    );
    if target_resolves_conflict_id is not null then
      update public.sync_conflicts set resolved_at = now()
      where id = target_resolves_conflict_id and user_id = target_user_id and resolved_at is null;
    end if;
    return response_payload;
  end if;

  -- A singleton snapshot has no per-record compare-and-swap information. Once
  -- record-level state exists, accepting one could let a stale client overwrite
  -- newer records. Preserve it as a conflict and require an upgraded client to
  -- reconcile individual records.
  if target_entity_type in ('tasks', 'goals', 'habits', 'truenorth') and target_entity_id = 'singleton'
    and jsonb_typeof(target_payload) = 'array'
    and exists (
      select 1 from public.sync_records
      where user_id = target_user_id and entity_type = target_entity_type and entity_id <> 'singleton'
    ) then
    select max(server_version), jsonb_agg(payload order by entity_id)
      into legacy_guard_version, legacy_guard_payload
    from public.sync_records
    where user_id = target_user_id and entity_type = target_entity_type and entity_id <> 'singleton';
    insert into public.sync_conflicts (
      user_id, entity_type, entity_id, mutation_id, base_server_version,
      server_version, local_payload, server_payload, local_deleted_at, server_deleted_at,
      local_version, local_updated_at, server_missing
    ) values (
      target_user_id, target_entity_type, target_entity_id, target_mutation_id,
      target_base_server_version, legacy_guard_version, target_payload, coalesce(legacy_guard_payload, '[]'::jsonb),
      target_deleted_at, null, target_version, target_updated_at, false
    ) returning id into conflict_id;
    response_payload := jsonb_build_object(
      'accepted', false,
      'conflictId', conflict_id,
      'legacySnapshotRejected', true,
      'serverMissing', false,
      'serverVersion', legacy_guard_version,
      'record', jsonb_build_object(
        'payload', coalesce(legacy_guard_payload, '[]'::jsonb),
        'deletedAt', null
      )
    );
    insert into public.sync_mutations (
      user_id, mutation_id, device_id, server_version, accepted,
      entity_type, entity_id, request_hash, result
    ) values (
      target_user_id, target_mutation_id, target_device_id, legacy_guard_version, false,
      target_entity_type, target_entity_id, request_fingerprint, response_payload
    );
    if target_resolves_conflict_id is not null then
      update public.sync_conflicts set resolved_at = now()
      where id = target_resolves_conflict_id and user_id = target_user_id and resolved_at is null;
    end if;
    return response_payload;
  end if;

  next_server_version := public.goalflow_next_change_version();
  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id, payload, updated_at, deleted_at
  ) values (
    target_user_id, target_entity_type, target_entity_id, target_version, next_server_version,
    target_device_id, target_payload, target_updated_at, target_deleted_at
  )
  on conflict (user_id, entity_type, entity_id) do update set
    version = excluded.version,
    server_version = excluded.server_version,
    device_id = excluded.device_id,
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  if target_entity_type = 'tasks' then
    perform public.project_goalflow_task_sync(
      target_user_id, target_entity_id, target_payload, next_server_version,
      target_updated_at, target_deleted_at
    );
  elsif target_entity_type = 'daily_plans' then
    perform public.project_goalflow_daily_plan_sync(
      target_user_id, target_entity_id, target_payload, next_server_version,
      target_updated_at, target_deleted_at
    );
  end if;
  select * into existing_record from public.sync_records
  where user_id = target_user_id and entity_type = target_entity_type and entity_id = target_entity_id;
  response_payload := jsonb_build_object(
    'accepted', true,
    'serverVersion', next_server_version,
    'record', to_jsonb(existing_record)
  );
  insert into public.sync_mutations (
    user_id, mutation_id, device_id, server_version, accepted,
    entity_type, entity_id, request_hash, result
  ) values (
    target_user_id, target_mutation_id, target_device_id, next_server_version, true,
    target_entity_type, target_entity_id, request_fingerprint, response_payload
  );
  if target_resolves_conflict_id is not null then
    update public.sync_conflicts set resolved_at = now()
    where id = target_resolves_conflict_id and user_id = target_user_id and resolved_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Conflict resolution was not durably recorded';
    end if;
  end if;
  -- Conflicts remain visible until an explicit, exact conflict resolution is
  -- durably recorded by the API. An unrelated accepted edit must not choose a side.
  return response_payload;
end;
$$;

revoke all on function public.push_sync_mutation(uuid, uuid, text, text, text, bigint, integer, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.push_sync_mutation_v2(uuid, uuid, text, text, text, bigint, integer, jsonb, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.push_sync_mutation_v2(uuid, uuid, text, text, text, bigint, integer, jsonb, timestamptz, timestamptz, uuid)
  to service_role;

-- Backfill canonical tasks that predate record-level synchronization. Existing
-- sync records win; this migration never overwrites them.
insert into public.sync_records (
  user_id, entity_type, entity_id, version, server_version, device_id, payload, updated_at, deleted_at
)
select
  task.user_id,
  'tasks',
  coalesce(task.legacy_entity_id, task.id::text),
  least(task.revision, 2147483647)::integer,
  public.goalflow_next_change_version(),
  'server-migration',
  public.goalflow_task_sync_payload(task),
  task.updated_at,
  task.deleted_at
from public.tasks task
on conflict (user_id, entity_type, entity_id) do nothing;

insert into public.sync_records (
  user_id, entity_type, entity_id, version, server_version, device_id, payload, updated_at, deleted_at
)
select
  plan.user_id,
  'daily_plans',
  plan.local_date::text,
  least(plan.revision, 2147483647)::integer,
  public.goalflow_next_change_version(),
  'server-migration',
  public.goalflow_daily_plan_sync_payload(plan),
  plan.updated_at,
  null
from public.daily_plans plan
on conflict (user_id, entity_type, entity_id) do nothing;

-- A single SQL statement gives the backup worker one coherent database
-- snapshot, including pending/idempotency/conflict state.
create or replace function public.export_goalflow_backup(target_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
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
    'entitlements', coalesce((select jsonb_agg(row_to_json(value)) from public.entitlements value where value.user_id = target_user_id), '[]'::jsonb)
  );
$$;
revoke all on function public.export_goalflow_backup(uuid) from public, anon, authenticated;
grant execute on function public.export_goalflow_backup(uuid) to service_role;

-- Declared before the restore function because PostgreSQL resolves composite
-- row types when a function is created. The idempotent declaration below also
-- applies RLS, grants, and indexes.
create table if not exists public.api_mutation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  operation text not null,
  request_hash text not null check (length(request_hash) = 64),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

-- Historical month-level commitments may legitimately be in the past when a
-- backup is restored. The restore function enables this transaction-local
-- bypass; ordinary writes retain every existing scheduling rule.
create or replace function public.validate_goalflow_task_schedule()
returns trigger
language plpgsql
as $$
declare
  profile_timezone text;
  local_today date;
begin
  if coalesce(current_setting('goalflow.data_restore', true), '') = 'on' then return new; end if;
  select timezone into profile_timezone from public.profiles where user_id = new.user_id;
  begin
    local_today := (now() at time zone coalesce(nullif(profile_timezone, ''), 'UTC'))::date;
  exception when invalid_parameter_value then
    local_today := current_date;
  end;
  if new.schedule_precision = 'month' then
    if new.scheduled_for <= date_trunc('month', local_today)::date then
      raise exception using errcode = '22023', message = 'Month-only tasks must use a future month';
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
    if new.frog_failures >= 2 then new.is_frog := true; end if;
  end if;
  if tg_op = 'UPDATE' and new is distinct from old then
    new.updated_at := now();
    new.revision := public.goalflow_next_task_revision();
  end if;
  return new;
end;
$$;

-- Atomic replace-restore for a verified decrypted server backup. Every delete
-- and insert is part of the caller's single PostgreSQL transaction; any bad
-- row, foreign key, or ownership mismatch rolls the complete restore back.
create or replace function public.restore_goalflow_backup(
  target_user_id uuid,
  backup_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  collections jsonb;
  collection_name text;
  sequence_floor bigint;
  idempotency_state_missing boolean := false;
  pre_restore_sync_records jsonb;
  restore_time timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('goalflow-restore:' || target_user_id::text, 0));
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception using errcode = 'P0002', message = 'Restore target auth user does not exist';
  end if;
  select coalesce(jsonb_agg(to_jsonb(record_value)), '[]'::jsonb)
    into pre_restore_sync_records
  from public.sync_records record_value
  where record_value.user_id = target_user_id;
  -- Reserve a sequence value before replacing records. Every restored record
  -- and every restore tombstone will therefore be newer than every cursor that
  -- could have existed before this transaction.
  sequence_floor := public.goalflow_next_change_version();
  perform setval(
    'public.goalflow_change_seq',
    greatest(
      sequence_floor,
      coalesce((select max(server_version) from public.sync_records), 1),
      coalesce((select max(server_version) from public.sync_mutations), 1)
    ),
    true
  );
  collections := case
    when jsonb_typeof(backup_payload->'collections') = 'object' then backup_payload->'collections'
    else backup_payload
  end;
  if jsonb_typeof(collections) <> 'object' then
    raise exception using errcode = '22023', message = 'Backup collections are invalid';
  end if;
  -- Backward compatibility for backups produced before sync/API receipts and
  -- conflicts were included. Their absence is reported; malformed values fail.
  foreach collection_name in array array[
    'telegram_captures','telegram_updates','sync_mutations','sync_conflicts','api_mutation_receipts'
  ] loop
    if not (collections ? collection_name) then
      collections := collections || jsonb_build_object(collection_name, '[]'::jsonb);
      idempotency_state_missing := true;
    end if;
  end loop;
  foreach collection_name in array array[
    'profiles','tasks','daily_plans','task_events','telegram_identities','telegram_captures',
    'telegram_updates','sync_records','sync_mutations','sync_conflicts','api_mutation_receipts','entitlements'
  ] loop
    if jsonb_typeof(collections->collection_name) <> 'array' then
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

  perform set_config('goalflow.data_restore', 'on', true);
  perform set_config('goalflow.sync_projection', 'on', true);

  delete from public.task_events where user_id = target_user_id;
  delete from public.daily_plans where user_id = target_user_id;
  delete from public.telegram_captures where user_id = target_user_id;
  delete from public.telegram_updates where telegram_user_id in (
    select telegram_user_id from public.telegram_identities where user_id = target_user_id
  );
  delete from public.telegram_identities where user_id = target_user_id;
  -- Accepted mutation receipts and conflict history are append-only recovery
  -- evidence. A point-in-time restore must not make a previously committed
  -- request executable for a second time.
  delete from public.sync_records where user_id = target_user_id;
  delete from public.entitlements where user_id = target_user_id;
  delete from public.tasks where user_id = target_user_id;

  insert into public.profiles (user_id, email, role, status, timezone, invited_by, created_at, updated_at)
  select target_user_id, restored.email, restored.role, restored.status, restored.timezone,
    restored.invited_by, restored.created_at, restored.updated_at
  from jsonb_populate_recordset(null::public.profiles, collections->'profiles') restored
  limit 1
  on conflict (user_id) do update set
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    timezone = excluded.timezone,
    invited_by = excluded.invited_by,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  insert into public.tasks (
    id, user_id, title, notes, tags, schedule_precision, scheduled_for, scheduled_time,
    planned_order, status, completed_at, is_frog, frog_failures, before_frog, source,
    parent_task_id, habit_id, estimated_minutes, goal_id, true_north_goal_id,
    legacy_entity_id, created_at, updated_at, deleted_at, revision, sync_server_version
  )
  select restored.id, target_user_id, restored.title, restored.notes, restored.tags,
    restored.schedule_precision, restored.scheduled_for, restored.scheduled_time,
    restored.planned_order, restored.status, restored.completed_at, restored.is_frog,
    restored.frog_failures, restored.before_frog, restored.source, null,
    restored.habit_id, restored.estimated_minutes, restored.goal_id,
    restored.true_north_goal_id, restored.legacy_entity_id, restored.created_at,
    restored.updated_at, restored.deleted_at, restored.revision, restored.sync_server_version
  from jsonb_populate_recordset(null::public.tasks, collections->'tasks') restored;

  update public.tasks task set parent_task_id = restored.parent_task_id
  from jsonb_populate_recordset(null::public.tasks, collections->'tasks') restored
  where task.id = restored.id and task.user_id = target_user_id and restored.parent_task_id is not null;

  insert into public.daily_plans (user_id, local_date, task_ids, confirmed_at, updated_at, revision, sync_server_version)
  select target_user_id, restored.local_date, restored.task_ids, restored.confirmed_at,
    restored.updated_at, restored.revision, restored.sync_server_version
  from jsonb_populate_recordset(null::public.daily_plans, collections->'daily_plans') restored;

  insert into public.task_events (id, user_id, task_id, event_type, local_date, metadata, created_at)
  select restored.id, target_user_id, restored.task_id, restored.event_type,
    restored.local_date, restored.metadata, restored.created_at
  from jsonb_populate_recordset(null::public.task_events, collections->'task_events') restored;

  insert into public.telegram_identities (
    telegram_user_id, user_id, telegram_username, telegram_chat_id,
    bot_access_granted, linked_at, updated_at
  )
  select restored.telegram_user_id, target_user_id, restored.telegram_username,
    restored.telegram_chat_id, restored.bot_access_granted, restored.linked_at, restored.updated_at
  from jsonb_populate_recordset(null::public.telegram_identities, collections->'telegram_identities') restored;

  insert into public.telegram_updates (
    update_id, telegram_user_id, received_at, processed_at, outcome, error_code, payload
  )
  select restored.update_id, restored.telegram_user_id, restored.received_at,
    restored.processed_at, restored.outcome, restored.error_code, restored.payload
  from jsonb_populate_recordset(null::public.telegram_updates, collections->'telegram_updates') restored;

  insert into public.telegram_captures (
    id, user_id, telegram_chat_id, kind, title, transcript, schedule_precision,
    scheduled_for, state, expires_at, created_at
  )
  select restored.id, target_user_id, restored.telegram_chat_id, restored.kind,
    restored.title, restored.transcript, restored.schedule_precision, restored.scheduled_for,
    restored.state, restored.expires_at, restored.created_at
  from jsonb_populate_recordset(null::public.telegram_captures, collections->'telegram_captures') restored;

  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id,
    payload, updated_at, deleted_at
  )
  select target_user_id, restored.entity_type, restored.entity_id, restored.version,
    public.goalflow_next_change_version(), 'server-restore', restored.payload,
    restore_time, restored.deleted_at
  from jsonb_populate_recordset(null::public.sync_records, collections->'sync_records') restored;

  -- Older backups may predate canonical task/plan projection. Recreate any
  -- missing records from the restored canonical rows before making tombstones.
  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id,
    payload, updated_at, deleted_at
  )
  select task.user_id, 'tasks', coalesce(task.legacy_entity_id, task.id::text),
    least(task.revision, 2147483647)::integer, public.goalflow_next_change_version(),
    'server-restore', public.goalflow_task_sync_payload(task), restore_time, task.deleted_at
  from public.tasks task where task.user_id = target_user_id
  on conflict (user_id, entity_type, entity_id) do nothing;

  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id,
    payload, updated_at, deleted_at
  )
  select plan.user_id, 'daily_plans', plan.local_date::text,
    least(plan.revision, 2147483647)::integer, public.goalflow_next_change_version(),
    'server-restore', public.goalflow_daily_plan_sync_payload(plan), restore_time, null
  from public.daily_plans plan where plan.user_id = target_user_id
  on conflict (user_id, entity_type, entity_id) do nothing;

  -- Anything that existed after the backup but is absent from the restored
  -- snapshot receives a fresh tombstone. Stale clients can no longer resurrect
  -- it merely because their cursor was ahead of the backup's old cursor.
  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id,
    payload, updated_at, deleted_at
  )
  select target_user_id, previous.entity_type, previous.entity_id,
    least(previous.version::bigint + 1, 2147483647)::integer,
    public.goalflow_next_change_version(), 'server-restore', previous.payload,
    restore_time, restore_time
  from jsonb_populate_recordset(null::public.sync_records, pre_restore_sync_records) previous
  where not exists (
    select 1 from public.sync_records current_record
    where current_record.user_id = target_user_id
      and current_record.entity_type = previous.entity_type
      and current_record.entity_id = previous.entity_id
  );

  insert into public.sync_mutations (
    user_id, mutation_id, device_id, server_version, accepted, created_at,
    entity_type, entity_id, request_hash, result
  )
  select target_user_id, restored.mutation_id, restored.device_id, restored.server_version,
    restored.accepted, restored.created_at, restored.entity_type, restored.entity_id,
    restored.request_hash, restored.result
  from jsonb_populate_recordset(null::public.sync_mutations, collections->'sync_mutations') restored
  on conflict (user_id, mutation_id) do nothing;

  insert into public.sync_conflicts (
    id, user_id, entity_type, entity_id, mutation_id, base_server_version,
    server_version, local_payload, server_payload, local_deleted_at, server_deleted_at,
    local_version, local_updated_at, server_missing, created_at, resolved_at
  )
  select restored.id, target_user_id, restored.entity_type, restored.entity_id,
    restored.mutation_id, restored.base_server_version, restored.server_version,
    restored.local_payload, restored.server_payload, restored.local_deleted_at,
    restored.server_deleted_at, restored.local_version, restored.local_updated_at,
    coalesce(restored.server_missing, false), restored.created_at, restored.resolved_at
  from jsonb_populate_recordset(null::public.sync_conflicts, collections->'sync_conflicts') restored
  on conflict do nothing;

  insert into public.api_mutation_receipts (
    user_id, mutation_id, operation, request_hash, response, created_at
  )
  select target_user_id, restored.mutation_id, restored.operation, restored.request_hash,
    restored.response, restored.created_at
  from jsonb_populate_recordset(null::public.api_mutation_receipts, collections->'api_mutation_receipts') restored
  on conflict (user_id, mutation_id) do nothing;

  insert into public.entitlements (user_id, plan, active, updated_at)
  select target_user_id, restored.plan, restored.active, restored.updated_at
  from jsonb_populate_recordset(null::public.entitlements, collections->'entitlements') restored;

  -- Rebase canonical revisions and their sync projections together. Restored
  -- values are data; old sequence numbers are not portable synchronization
  -- identities.
  update public.tasks task set
    revision = public.goalflow_next_task_revision(),
    sync_server_version = record_value.server_version
  from public.sync_records record_value
  where task.user_id = target_user_id
    and record_value.user_id = target_user_id
    and record_value.entity_type = 'tasks'
    and record_value.entity_id = coalesce(task.legacy_entity_id, task.id::text);

  update public.sync_records record_value set
    version = least(task.revision, 2147483647)::integer,
    payload = public.goalflow_task_sync_payload(task),
    updated_at = restore_time,
    deleted_at = task.deleted_at
  from public.tasks task
  where task.user_id = target_user_id
    and record_value.user_id = target_user_id
    and record_value.entity_type = 'tasks'
    and record_value.entity_id = coalesce(task.legacy_entity_id, task.id::text);

  update public.daily_plans plan set
    revision = public.goalflow_next_task_revision(),
    sync_server_version = record_value.server_version
  from public.sync_records record_value
  where plan.user_id = target_user_id
    and record_value.user_id = target_user_id
    and record_value.entity_type = 'daily_plans'
    and record_value.entity_id = plan.local_date::text;

  update public.sync_records record_value set
    version = least(plan.revision, 2147483647)::integer,
    payload = public.goalflow_daily_plan_sync_payload(plan),
    updated_at = restore_time,
    deleted_at = null
  from public.daily_plans plan
  where plan.user_id = target_user_id
    and record_value.user_id = target_user_id
    and record_value.entity_type = 'daily_plans'
    and record_value.entity_id = plan.local_date::text;

  -- A restore is allowed to choose the backup as canonical, but it must not
  -- erase a newer same-record value that arrived before the restore transaction.
  -- Preserve both sides in the durable conflict ledger; absent records already
  -- retain the newer payload in their fresh tombstone above.
  insert into public.sync_conflicts (
    user_id, entity_type, entity_id, mutation_id, base_server_version,
    server_version, local_payload, server_payload, local_deleted_at, server_deleted_at,
    local_version, local_updated_at, server_missing
  )
  select target_user_id, previous.entity_type, previous.entity_id, gen_random_uuid(),
    previous.server_version, current_record.server_version, previous.payload,
    current_record.payload, previous.deleted_at, current_record.deleted_at,
    previous.version, previous.updated_at, false
  from jsonb_populate_recordset(null::public.sync_records, pre_restore_sync_records) previous
  join public.sync_records current_record
    on current_record.user_id = target_user_id
    and current_record.entity_type = previous.entity_type
    and current_record.entity_id = previous.entity_id
  where (previous.payload is distinct from current_record.payload
      or previous.deleted_at is distinct from current_record.deleted_at)
    and not exists (
      select 1 from public.sync_conflicts existing_conflict
      where existing_conflict.user_id = target_user_id
        and existing_conflict.entity_type = previous.entity_type
        and existing_conflict.entity_id = previous.entity_id
        and existing_conflict.resolved_at is null
        and existing_conflict.local_payload = previous.payload
        and existing_conflict.local_deleted_at is not distinct from previous.deleted_at
    );

  update public.sync_conflicts conflict set
    server_version = record_value.server_version,
    server_payload = record_value.payload,
    server_deleted_at = record_value.deleted_at
  from public.sync_records record_value
  where conflict.user_id = target_user_id and conflict.resolved_at is null
    and record_value.user_id = target_user_id
    and record_value.entity_type = conflict.entity_type
    and record_value.entity_id = conflict.entity_id;

  sequence_floor := public.goalflow_next_change_version();
  perform setval(
    'public.goalflow_change_seq',
    greatest(
      sequence_floor,
      coalesce((select max(server_version) from public.sync_records), 1),
      coalesce((select max(server_version) from public.sync_mutations), 1)
    ),
    true
  );
  sequence_floor := public.goalflow_next_task_revision();
  perform setval(
    'public.goalflow_task_revision_seq',
    greatest(
      sequence_floor,
      coalesce((select max(revision) from public.tasks), 1),
      coalesce((select max(revision) from public.daily_plans), 1)
    ),
    true
  );
  perform set_config('goalflow.data_restore', 'off', true);
  perform set_config('goalflow.sync_projection', 'off', true);
  return jsonb_build_object(
    'restored', true,
    'tasks', (select count(*) from public.tasks where user_id = target_user_id),
    'syncRecords', (select count(*) from public.sync_records where user_id = target_user_id),
    'pendingReceipts', (select count(*) from public.sync_mutations where user_id = target_user_id),
    'conflicts', (select count(*) from public.sync_conflicts where user_id = target_user_id and resolved_at is null),
    'legacyIdempotencyStateMissing', idempotency_state_missing
  );
exception when others then
  perform set_config('goalflow.data_restore', 'off', true);
  perform set_config('goalflow.sync_projection', 'off', true);
  raise;
end;
$$;
revoke all on function public.restore_goalflow_backup(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_goalflow_backup(uuid, jsonb) to service_role;

create table if not exists public.api_mutation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  operation text not null,
  request_hash text not null check (length(request_hash) = 64),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);
alter table public.api_mutation_receipts enable row level security;
revoke all on public.api_mutation_receipts from anon, authenticated;
create index if not exists api_mutation_receipts_created_idx
  on public.api_mutation_receipts (user_id, created_at desc);

create or replace function public.goalflow_existing_api_receipt(
  target_user_id uuid,
  target_mutation_id uuid,
  target_operation text,
  target_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare receipt public.api_mutation_receipts%rowtype;
begin
  select * into receipt from public.api_mutation_receipts
  where user_id = target_user_id and mutation_id = target_mutation_id;
  if not found then return null; end if;
  if receipt.operation <> target_operation or receipt.request_hash <> target_request_hash then
    raise exception using errcode = '22023', message = 'Idempotency key was reused for a different task mutation';
  end if;
  return receipt.response;
end;
$$;

create or replace function public.goalflow_require_task_revision(
  target_user_id uuid,
  target_task_id uuid,
  target_expected_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_revision bigint;
begin
  select revision into current_revision from public.tasks
  where id = target_task_id and user_id = target_user_id
    and status = 'open' and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;
  if target_expected_revision is null or current_revision <> target_expected_revision then
    raise exception using errcode = '40001', message = 'Task revision changed';
  end if;
end;
$$;

create or replace function public.goalflow_require_plan_revision(
  target_user_id uuid,
  target_local_date date,
  target_expected_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_revision bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    target_user_id::text || ':daily-plan:' || target_local_date::text, 0
  ));
  select revision into current_revision from public.daily_plans
  where user_id = target_user_id and local_date = target_local_date
  for update;
  if (found and target_expected_revision is null)
    or (not found and target_expected_revision is not null)
    or (found and current_revision <> target_expected_revision) then
    raise exception using errcode = '40001', message = 'Daily plan revision changed';
  end if;
end;
$$;

create or replace function public.goalflow_create_task_idempotent(
  target_user_id uuid,
  target_mutation_id uuid,
  target_local_date date,
  task_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_fingerprint text;
  existing_response jsonb;
  created_task public.tasks%rowtype;
  requested_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_object('date', target_local_date, 'task', task_payload)::text, 'utf8'), 'sha256'), 'hex');
  existing_response := public.goalflow_existing_api_receipt(target_user_id, target_mutation_id, 'create-task', request_fingerprint);
  if existing_response is not null then return existing_response; end if;
  if coalesce(task_payload->>'taskId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    requested_id := (task_payload->>'taskId')::uuid;
  else requested_id := gen_random_uuid(); end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':task-id:' || requested_id::text, 0));
  select * into created_task from public.tasks where id = requested_id;
  if found then
    if created_task.user_id <> target_user_id
      or created_task.title <> trim(task_payload->>'title')
      or created_task.notes <> coalesce(task_payload->>'notes', '')
      or created_task.tags <> array(select jsonb_array_elements_text(coalesce(task_payload->'tags', '[]'::jsonb)))
      or created_task.schedule_precision <> task_payload->>'schedulePrecision'
      or created_task.scheduled_for <> case when task_payload->>'schedulePrecision' = 'month'
        then to_date((task_payload->>'scheduledFor') || '-01', 'YYYY-MM-DD')
        else (task_payload->>'scheduledFor')::date end
      or created_task.source <> coalesce(task_payload->>'source', 'manual')
      or created_task.deleted_at is not null
    then
      raise exception using errcode = '22023', message = 'Task identity was reused for different task data';
    end if;
    insert into public.api_mutation_receipts (user_id, mutation_id, operation, request_hash, response)
    values (target_user_id, target_mutation_id, 'create-task', request_fingerprint, to_jsonb(created_task));
    return to_jsonb(created_task);
  end if;
  if exists (
    select 1 from public.sync_records
    where user_id = target_user_id and entity_type = 'tasks'
      and entity_id = requested_id::text and deleted_at is not null
  ) then
    raise exception using errcode = '40001', message = 'A deleted task identity cannot be resurrected';
  end if;
  insert into public.tasks (
    id, user_id, title, notes, tags, schedule_precision, scheduled_for, scheduled_time,
    planned_order, is_frog, before_frog, source, parent_task_id, habit_id, estimated_minutes
  ) values (
    requested_id,
    target_user_id,
    trim(task_payload->>'title'),
    coalesce(task_payload->>'notes', ''),
    array(select jsonb_array_elements_text(coalesce(task_payload->'tags', '[]'::jsonb))),
    task_payload->>'schedulePrecision',
    case when task_payload->>'schedulePrecision' = 'month'
      then to_date((task_payload->>'scheduledFor') || '-01', 'YYYY-MM-DD')
      else (task_payload->>'scheduledFor')::date end,
    nullif(task_payload->>'scheduledTime', '')::time,
    coalesce((task_payload->>'plannedOrder')::integer, 0),
    coalesce((task_payload->>'isFrog')::boolean, false),
    coalesce((task_payload->>'beforeFrog')::boolean, false),
    coalesce(task_payload->>'source', 'manual'),
    nullif(task_payload->>'parentTaskId', '')::uuid,
    nullif(task_payload->>'habitId', '')::uuid,
    coalesce((task_payload->>'estimatedMinutes')::integer, 25)
  ) returning * into created_task;
  insert into public.task_events (user_id, task_id, event_type, local_date)
  values (target_user_id, created_task.id, 'created', target_local_date);
  insert into public.api_mutation_receipts (user_id, mutation_id, operation, request_hash, response)
  values (target_user_id, target_mutation_id, 'create-task', request_fingerprint, to_jsonb(created_task));
  return to_jsonb(created_task);
end;
$$;

create or replace function public.goalflow_complete_task_idempotent(
  target_user_id uuid, target_mutation_id uuid, target_task_id uuid, target_local_date date,
  target_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare request_fingerprint text; existing_response jsonb; updated_task public.tasks%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_array(target_task_id, target_local_date, target_expected_revision)::text, 'utf8'), 'sha256'), 'hex');
  existing_response := public.goalflow_existing_api_receipt(target_user_id, target_mutation_id, 'complete-task', request_fingerprint);
  if existing_response is not null then return existing_response; end if;
  perform public.goalflow_require_task_revision(target_user_id, target_task_id, target_expected_revision);
  updated_task := public.goalflow_complete_task(target_user_id, target_task_id, target_local_date);
  insert into public.api_mutation_receipts values (target_user_id, target_mutation_id, 'complete-task', request_fingerprint, to_jsonb(updated_task), now());
  return to_jsonb(updated_task);
end; $$;

create or replace function public.goalflow_skip_task_idempotent(
  target_user_id uuid, target_mutation_id uuid, target_task_id uuid, target_day date,
  target_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare request_fingerprint text; existing_response jsonb; updated_task public.tasks%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_array(target_task_id, target_day, target_expected_revision)::text, 'utf8'), 'sha256'), 'hex');
  existing_response := public.goalflow_existing_api_receipt(target_user_id, target_mutation_id, 'skip-task', request_fingerprint);
  if existing_response is not null then return existing_response; end if;
  perform public.goalflow_require_task_revision(target_user_id, target_task_id, target_expected_revision);
  updated_task := public.goalflow_skip_task(target_user_id, target_task_id, target_day);
  insert into public.api_mutation_receipts values (target_user_id, target_mutation_id, 'skip-task', request_fingerprint, to_jsonb(updated_task), now());
  return to_jsonb(updated_task);
end; $$;

create or replace function public.goalflow_drop_task_idempotent(
  target_user_id uuid, target_mutation_id uuid, target_task_id uuid, target_local_date date,
  target_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare request_fingerprint text; existing_response jsonb; updated_task public.tasks%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_array(target_task_id, target_local_date, target_expected_revision)::text, 'utf8'), 'sha256'), 'hex');
  existing_response := public.goalflow_existing_api_receipt(target_user_id, target_mutation_id, 'drop-task', request_fingerprint);
  if existing_response is not null then return existing_response; end if;
  perform public.goalflow_require_task_revision(target_user_id, target_task_id, target_expected_revision);
  updated_task := public.goalflow_drop_task(target_user_id, target_task_id, target_local_date);
  insert into public.api_mutation_receipts values (target_user_id, target_mutation_id, 'drop-task', request_fingerprint, to_jsonb(updated_task), now());
  return to_jsonb(updated_task);
end; $$;

create or replace function public.goalflow_reschedule_task_idempotent(
  target_user_id uuid,
  target_mutation_id uuid,
  target_task_id uuid,
  target_local_date date,
  target_schedule_precision text,
  target_scheduled_for date,
  target_scheduled_time time,
  target_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare request_fingerprint text; existing_response jsonb; updated_task public.tasks%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_array(target_task_id, target_local_date, target_schedule_precision, target_scheduled_for, target_scheduled_time, target_expected_revision)::text, 'utf8'), 'sha256'), 'hex');
  existing_response := public.goalflow_existing_api_receipt(target_user_id, target_mutation_id, 'reschedule-task', request_fingerprint);
  if existing_response is not null then return existing_response; end if;
  perform public.goalflow_require_task_revision(target_user_id, target_task_id, target_expected_revision);
  updated_task := public.goalflow_reschedule_task(target_user_id, target_task_id, target_local_date, target_schedule_precision, target_scheduled_for, target_scheduled_time);
  insert into public.api_mutation_receipts values (target_user_id, target_mutation_id, 'reschedule-task', request_fingerprint, to_jsonb(updated_task), now());
  return to_jsonb(updated_task);
end; $$;

create or replace function public.goalflow_break_down_task_idempotent(
  target_user_id uuid,
  target_mutation_id uuid,
  target_task_id uuid,
  child_tasks jsonb,
  target_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare request_fingerprint text; existing_response jsonb; operation_response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_array(target_task_id, child_tasks, target_expected_revision)::text, 'utf8'), 'sha256'), 'hex');
  existing_response := public.goalflow_existing_api_receipt(target_user_id, target_mutation_id, 'break-down-task', request_fingerprint);
  if existing_response is not null then return existing_response; end if;
  perform public.goalflow_require_task_revision(target_user_id, target_task_id, target_expected_revision);
  operation_response := public.goalflow_break_down_task(target_user_id, target_task_id, child_tasks);
  insert into public.api_mutation_receipts values (target_user_id, target_mutation_id, 'break-down-task', request_fingerprint, operation_response, now());
  return operation_response;
end; $$;

create or replace function public.goalflow_confirm_plan_idempotent(
  target_user_id uuid,
  target_mutation_id uuid,
  target_local_date date,
  target_task_ids uuid[],
  target_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare request_fingerprint text; existing_response jsonb; saved_plan public.daily_plans%rowtype; confirmed_time timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_mutation_id::text, 0));
  request_fingerprint := encode(digest(convert_to(jsonb_build_array(target_local_date, target_task_ids, target_expected_revision)::text, 'utf8'), 'sha256'), 'hex');
  existing_response := public.goalflow_existing_api_receipt(target_user_id, target_mutation_id, 'confirm-plan', request_fingerprint);
  if existing_response is not null then return existing_response; end if;
  perform public.goalflow_require_plan_revision(target_user_id, target_local_date, target_expected_revision);
  confirmed_time := now();
  insert into public.daily_plans (user_id, local_date, task_ids, confirmed_at, updated_at)
  values (target_user_id, target_local_date, target_task_ids, confirmed_time, confirmed_time)
  on conflict (user_id, local_date) do update set
    task_ids = excluded.task_ids,
    confirmed_at = excluded.confirmed_at,
    updated_at = excluded.updated_at
  returning * into saved_plan;
  insert into public.api_mutation_receipts values (target_user_id, target_mutation_id, 'confirm-plan', request_fingerprint, to_jsonb(saved_plan), now());
  return to_jsonb(saved_plan);
end; $$;

revoke all on function public.goalflow_existing_api_receipt(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.goalflow_require_task_revision(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.goalflow_require_plan_revision(uuid, date, bigint) from public, anon, authenticated;
revoke all on function public.goalflow_create_task_idempotent(uuid, uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.goalflow_complete_task_idempotent(uuid, uuid, uuid, date, bigint) from public, anon, authenticated;
revoke all on function public.goalflow_skip_task_idempotent(uuid, uuid, uuid, date, bigint) from public, anon, authenticated;
revoke all on function public.goalflow_drop_task_idempotent(uuid, uuid, uuid, date, bigint) from public, anon, authenticated;
revoke all on function public.goalflow_reschedule_task_idempotent(uuid, uuid, uuid, date, text, date, time, bigint) from public, anon, authenticated;
revoke all on function public.goalflow_break_down_task_idempotent(uuid, uuid, uuid, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.goalflow_confirm_plan_idempotent(uuid, uuid, date, uuid[], bigint) from public, anon, authenticated;
grant execute on function public.goalflow_create_task_idempotent(uuid, uuid, date, jsonb) to service_role;
grant execute on function public.goalflow_complete_task_idempotent(uuid, uuid, uuid, date, bigint) to service_role;
grant execute on function public.goalflow_skip_task_idempotent(uuid, uuid, uuid, date, bigint) to service_role;
grant execute on function public.goalflow_drop_task_idempotent(uuid, uuid, uuid, date, bigint) to service_role;
grant execute on function public.goalflow_reschedule_task_idempotent(uuid, uuid, uuid, date, text, date, time, bigint) to service_role;
grant execute on function public.goalflow_break_down_task_idempotent(uuid, uuid, uuid, jsonb, bigint) to service_role;
grant execute on function public.goalflow_confirm_plan_idempotent(uuid, uuid, date, uuid[], bigint) to service_role;

-- Recreate after api_mutation_receipts exists so backup/restore also preserves
-- task-API idempotency receipts. Replaying a timed-out request after a restore
-- must return its original result rather than duplicate a task or event.
create or replace function public.export_goalflow_backup(target_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
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
    'entitlements', coalesce((select jsonb_agg(row_to_json(value)) from public.entitlements value where value.user_id = target_user_id), '[]'::jsonb)
  );
$$;
revoke all on function public.export_goalflow_backup(uuid) from public, anon, authenticated;
grant execute on function public.export_goalflow_backup(uuid) to service_role;
