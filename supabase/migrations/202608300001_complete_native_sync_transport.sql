-- Complete the native record-level transport without rewriting an existing
-- migration. Installations that already applied protocol v3 receive the same
-- task_events allowance as clean databases, and the patch fails visibly if
-- the expected RPC body has diverged instead of guessing at a replacement.

do $goalflow_transport$
declare
  function_oid oid;
  function_definition text;
  patched_definition text;
  validation_before constant text := E'if target_entity_type not in (\n    ''tasks'',''goals'',''habits'',''stats'',''progress'',''hashtags'',''accountability'',\n    ''truenorth'',''amalgam'',''tracking'',''circadian'',''settings'',''daily_plans''\n  ) or length(target_entity_id) not between 1 and 240 then';
  validation_after constant text := E'if target_entity_type not in (\n    ''tasks'',''goals'',''habits'',''stats'',''progress'',''hashtags'',''accountability'',\n    ''truenorth'',''amalgam'',''tracking'',''circadian'',''settings'',''daily_plans'',''task_events''\n  ) or length(target_entity_id) not between 1 and 240 then';
begin
  function_oid := to_regprocedure(
    'public.push_sync_mutation_v2(uuid,uuid,text,text,text,bigint,integer,jsonb,timestamptz,timestamptz,uuid)'
  );
  if function_oid is null then
    raise exception 'Protocol-v3 synchronization RPC is missing';
  end if;

  function_definition := pg_get_functiondef(function_oid);
  if position(validation_after in function_definition) > 0 then
    return;
  end if;
  if length(function_definition) - length(replace(function_definition, validation_before, ''))
      <> length(validation_before) then
    raise exception 'Protocol-v3 synchronization RPC has an unexpected validation body';
  end if;

  patched_definition := replace(function_definition, validation_before, validation_after);
  execute patched_definition;
  if position(validation_after in pg_get_functiondef(function_oid)) = 0 then
    raise exception 'Native task-event synchronization was not installed';
  end if;
end;
$goalflow_transport$;

-- Canonical task/daily-plan mutations know only a subset of the synchronized
-- payload. Merge their authoritative fields into the existing JSON object so
-- a server-side mutation cannot erase web/native fields it does not model.
create or replace function public.goalflow_task_sync_payload(task_row public.tasks)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce((
    select case when jsonb_typeof(record.payload) = 'object' then record.payload else '{}'::jsonb end
    from public.sync_records record
    where record.user_id = task_row.user_id
      and record.entity_type = 'tasks'
      and record.entity_id = coalesce(task_row.legacy_entity_id, task_row.id::text)
  ), '{}'::jsonb) || jsonb_build_object(
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
    'trueNorthGoalId', task_row.true_north_goal_id,
    'duration', task_row.estimated_minutes,
    'createdAt', floor(extract(epoch from task_row.created_at) * 1000),
    'updatedAt', floor(extract(epoch from task_row.updated_at) * 1000),
    'deletedAt', task_row.deleted_at
  );
$$;

create or replace function public.goalflow_daily_plan_sync_payload(plan_row public.daily_plans)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce((
    select case when jsonb_typeof(record.payload) = 'object' then record.payload else '{}'::jsonb end
    from public.sync_records record
    where record.user_id = plan_row.user_id
      and record.entity_type = 'daily_plans'
      and record.entity_id = plan_row.local_date::text
  ), '{}'::jsonb) || jsonb_build_object(
    'id', plan_row.local_date::text,
    'localDate', plan_row.local_date::text,
    'taskIds', to_jsonb(plan_row.task_ids),
    'confirmedAt', floor(extract(epoch from plan_row.confirmed_at) * 1000)
  );
$$;

create or replace function public.goalflow_task_event_sync_payload(event_row public.task_events)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', event_row.id,
    'taskId', event_row.task_id,
    'eventType', event_row.event_type,
    'localDate', event_row.local_date::text,
    'metadata', event_row.metadata,
    'createdAt', event_row.created_at
  );
$$;

-- Server/API task events must reach native second devices too. When an event
-- originated in sync_records, that record already exists and prevents a loop.
create or replace function public.mirror_goalflow_task_event_to_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_server_version bigint;
  event_payload jsonb;
  existing_record public.sync_records%rowtype;
begin
  if coalesce(current_setting('goalflow.data_restore', true), '') = 'on'
    or pg_trigger_depth() > 1 then
    return new;
  end if;
  event_payload := public.goalflow_task_event_sync_payload(new);
  perform pg_advisory_xact_lock(hashtextextended(
    new.user_id::text || ':task_events:' || new.id::text, 0
  ));
  select * into existing_record from public.sync_records
  where user_id = new.user_id and entity_type = 'task_events' and entity_id = new.id::text
  for update;
  if found then
    if existing_record.payload is distinct from event_payload or existing_record.deleted_at is not null then
      insert into public.sync_conflicts (
        user_id, entity_type, entity_id, mutation_id, base_server_version,
        server_version, local_payload, server_payload, local_deleted_at, server_deleted_at,
        local_version, local_updated_at, server_missing
      ) values (
        new.user_id, 'task_events', new.id::text, gen_random_uuid(), existing_record.server_version,
        existing_record.server_version, event_payload, existing_record.payload, null,
        existing_record.deleted_at, 1, new.created_at, false
      );
    end if;
    return new;
  end if;
  next_server_version := public.goalflow_next_change_version();
  insert into public.sync_records (
    user_id, entity_type, entity_id, version, server_version, device_id,
    payload, updated_at, deleted_at
  ) values (
    new.user_id, 'task_events', new.id::text, 1, next_server_version, 'server',
    event_payload, new.created_at, null
  );
  return new;
end;
$$;

drop trigger if exists mirror_goalflow_task_event_to_sync_trigger on public.task_events;
create trigger mirror_goalflow_task_event_to_sync_trigger
after insert on public.task_events
for each row execute function public.mirror_goalflow_task_event_to_sync();

-- Make pre-existing canonical history visible to native devices using fresh,
-- monotonically increasing cursors. Existing synchronized events always win.
insert into public.sync_records (
  user_id, entity_type, entity_id, version, server_version, device_id,
  payload, updated_at, deleted_at
)
select event.user_id, 'task_events', event.id::text, 1,
  public.goalflow_next_change_version(), 'server-migration',
  public.goalflow_task_event_sync_payload(event), event.created_at, null
from public.task_events event
where not exists (
  select 1 from public.sync_records record
  where record.user_id = event.user_id
    and record.entity_type = 'task_events'
    and record.entity_id = event.id::text
);

revoke all on function public.goalflow_task_sync_payload(public.tasks) from public, anon, authenticated;
revoke all on function public.goalflow_daily_plan_sync_payload(public.daily_plans) from public, anon, authenticated;
revoke all on function public.goalflow_task_event_sync_payload(public.task_events) from public, anon, authenticated;
grant execute on function public.goalflow_task_sync_payload(public.tasks) to service_role;
grant execute on function public.goalflow_daily_plan_sync_payload(public.daily_plans) to service_role;
grant execute on function public.goalflow_task_event_sync_payload(public.task_events) to service_role;
