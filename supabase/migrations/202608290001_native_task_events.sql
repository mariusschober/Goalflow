-- Project native lifecycle-event records into the canonical append-only history.
-- The sync record remains the idempotent transport; this trigger only exposes
-- task_events to the existing server domain and never rewrites an event.

create or replace function public.project_goalflow_task_event_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  event_id uuid;
  task_id uuid;
  event_type_value text;
  local_date_text text;
  local_date_value date;
  metadata_value jsonb;
  created_at_text text;
  created_at_value timestamptz;
  existing_event public.task_events%rowtype;
begin
  if new.entity_type <> 'task_events' then
    return new;
  end if;

  -- Lifecycle history is append-only. A transport tombstone is retained in
  -- sync_records for protocol completeness but cannot erase canonical history.
  if new.deleted_at is not null then
    return new;
  end if;
  if jsonb_typeof(new.payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Task event mutation payload must be an object';
  end if;

  item := new.payload;

  begin
    event_id := coalesce(nullif(item->>'id', ''), nullif(item->>'event_id', ''))::uuid;
    task_id := coalesce(nullif(item->>'taskId', ''), nullif(item->>'task_id', ''))::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Task event mutation has an invalid UUID identity';
  end;
  if event_id is null or task_id is null then
    raise exception using errcode = '22023', message = 'Task event mutation has no identity';
  end if;

  event_type_value := coalesce(nullif(item->>'eventType', ''), nullif(item->>'event_type', ''));
  if event_type_value not in (
    'created', 'completed', 'skipped', 'rescheduled', 'promoted_to_frog',
    'broken_down', 'dropped', 'restored'
  ) then
    raise exception using errcode = '22023', message = 'Task event mutation has an invalid event type';
  end if;

  local_date_text := coalesce(nullif(item->>'localDate', ''), nullif(item->>'local_date', ''));
  if local_date_text is null or local_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'Task event mutation has an invalid local date';
  end if;
  begin
    local_date_value := local_date_text::date;
  exception when others then
    raise exception using errcode = '22023', message = 'Task event mutation has an invalid local date';
  end;

  if not exists (
    select 1
    from public.tasks
    where id = task_id and user_id = new.user_id
  ) then
    raise exception using errcode = '23503', message = 'Task event references a task owned by another user or not yet synchronized';
  end if;

  metadata_value := item->'metadata';
  if metadata_value is null or jsonb_typeof(metadata_value) = 'null' then
    metadata_value := item->'metadata_json';
  end if;
  if metadata_value is null or jsonb_typeof(metadata_value) = 'null' then
    metadata_value := '{}'::jsonb;
  end if;

  created_at_text := coalesce(nullif(item->>'createdAt', ''), nullif(item->>'created_at', ''));
  if created_at_text is null then
    raise exception using errcode = '22023', message = 'Task event mutation has no creation timestamp';
  end if;
  begin
    if created_at_text ~ '^\d+$' then
      created_at_value := to_timestamp(created_at_text::numeric / 1000.0);
    else
      created_at_value := created_at_text::timestamptz;
    end if;
  exception when others then
    raise exception using errcode = '22023', message = 'Task event mutation has an invalid creation timestamp';
  end;
  if created_at_value is null then
    raise exception using errcode = '22023', message = 'Task event mutation has no creation timestamp';
  end if;

  select * into existing_event
  from public.task_events
  where id = event_id;

  if found then
    if existing_event.user_id = new.user_id
      and existing_event.task_id = task_id
      and existing_event.event_type = event_type_value
      and existing_event.local_date = local_date_value
      and existing_event.metadata is not distinct from metadata_value
      and existing_event.created_at = created_at_value then
      return new;
    end if;
    raise exception using errcode = '23505', message = 'Task event identity is already used for different history';
  end if;

  insert into public.task_events (
    id, user_id, task_id, event_type, local_date, metadata, created_at
  ) values (
    event_id, new.user_id, task_id, event_type_value, local_date_value, metadata_value, created_at_value
  );

  return new;
end;
$$;

drop trigger if exists project_goalflow_task_event_sync_trigger on public.sync_records;
create trigger project_goalflow_task_event_sync_trigger
after insert or update of entity_type, entity_id, payload, deleted_at on public.sync_records
for each row execute function public.project_goalflow_task_event_sync();
