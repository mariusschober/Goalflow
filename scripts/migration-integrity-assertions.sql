\set ON_ERROR_STOP on

do $$
declare
  target_user constant uuid := '11111111-1111-4111-8111-111111111111';
  task_mutation constant uuid := '55555555-5555-4555-8555-555555555555';
  completion_mutation constant uuid := '66666666-6666-4666-8666-666666666666';
  sync_mutation constant uuid := '77777777-7777-4777-8777-777777777777';
  plan_mutation constant uuid := '12121212-1212-4212-8212-121212121212';
  conflicting_mutation constant uuid := '88888888-8888-4888-8888-888888888888';
  out_of_order_mutation constant uuid := '13131313-1313-4313-8313-131313131313';
  resolution_mutation constant uuid := '14141414-1414-4414-8414-141414141414';
  reschedule_mutation constant uuid := '15151515-1515-4515-8515-151515151515';
  stale_reschedule_mutation constant uuid := '16161616-1616-4616-8616-161616161616';
  post_backup_sync_mutation constant uuid := '17171717-1717-4717-8717-171717171717';
  post_backup_task_mutation constant uuid := '18181818-1818-4818-8818-181818181818';
  post_backup_task_id constant uuid := '19191919-1919-4919-8919-191919191919';
  task_event_mutation constant uuid := '20202020-2020-4020-8020-202020202020';
  task_event_id constant uuid := '21212121-2121-4121-8121-212121212121';
  created_task_id constant uuid := '99999999-9999-4999-8999-999999999999';
  first_response jsonb;
  retry_response jsonb;
  mismatch_response jsonb;
  conflict_response jsonb;
  backup_payload jsonb;
  preserved_title text;
  expected_revision bigint;
  cursor_before_restore bigint;
  resolution_conflict_id uuid;
begin
  if public.goalflow_sync_protocol_version() <> 3 then
    raise exception 'hardened sync protocol version is not active';
  end if;
  if not exists (select 1 from public.tasks where user_id = target_user and title = 'Preserve seeded task') then
    raise exception 'forward migration lost the seeded task';
  end if;
  if not exists (select 1 from public.sync_mutations where user_id = target_user and mutation_id = '33333333-3333-4333-8333-333333333333') then
    raise exception 'forward migration lost an old sync receipt';
  end if;
  if not exists (select 1 from public.sync_conflicts where user_id = target_user and mutation_id = '44444444-4444-4444-8444-444444444444') then
    raise exception 'forward migration lost an unresolved conflict';
  end if;
  if not exists (select 1 from public.daily_plans where user_id = target_user and local_date = '2099-01-01') then
    raise exception 'forward migration lost the seeded planning decision';
  end if;
  if position('at time zone' in lower(pg_get_functiondef('public.validate_goalflow_task_schedule()'::regprocedure))) = 0 then
    raise exception 'forward migration regressed user-timezone schedule validation';
  end if;

  first_response := public.goalflow_create_task_idempotent(
    target_user,
    task_mutation,
    '2099-01-01',
    jsonb_build_object(
      'taskId', created_task_id,
      'title', 'Idempotent task',
      'notes', '',
      'tags', jsonb_build_array(),
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-01',
      'plannedOrder', 0,
      'isFrog', false,
      'beforeFrog', false,
      'source', 'manual',
      'estimatedMinutes', 25
    )
  );
  retry_response := public.goalflow_create_task_idempotent(
    target_user,
    task_mutation,
    '2099-01-01',
    jsonb_build_object(
      'taskId', created_task_id,
      'title', 'Idempotent task',
      'notes', '',
      'tags', jsonb_build_array(),
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-01',
      'plannedOrder', 0,
      'isFrog', false,
      'beforeFrog', false,
      'source', 'manual',
      'estimatedMinutes', 25
    )
  );
  if first_response <> retry_response
    or (select count(*) from public.tasks where id = created_task_id) <> 1
    or (select count(*) from public.task_events where task_id = created_task_id and event_type = 'created') <> 1
    or (select count(*)
        from public.task_events event
        join public.sync_records record
          on record.user_id = event.user_id
          and record.entity_type = 'task_events'
          and record.entity_id = event.id::text
        where event.task_id = created_task_id and event.event_type = 'created') <> 1 then
    raise exception 'duplicate task request was not idempotent';
  end if;
  expected_revision := (first_response->>'revision')::bigint;

  first_response := public.goalflow_complete_task_idempotent(
    target_user, completion_mutation, created_task_id, '2099-01-01',
    expected_revision
  );
  retry_response := public.goalflow_complete_task_idempotent(
    target_user, completion_mutation, created_task_id, '2099-01-01',
    expected_revision
  );
  if first_response <> retry_response
    or (select count(*) from public.task_events where task_id = created_task_id and event_type = 'completed') <> 1 then
    raise exception 'repeated completion was not idempotent';
  end if;

  first_response := public.push_sync_mutation_v2(
    target_user, task_event_mutation, 'native-device', 'task_events',
    task_event_id::text, null, 1,
    jsonb_build_object(
      'id', task_event_id,
      'taskId', created_task_id,
      'eventType', 'skipped',
      'localDate', '2099-01-01',
      'metadata', true,
      'createdAt', 4070908800000
    ),
    '2099-01-01T00:00:00Z', null, null
  );
  retry_response := public.push_sync_mutation_v2(
    target_user, task_event_mutation, 'native-device', 'task_events',
    task_event_id::text, null, 1,
    jsonb_build_object(
      'id', task_event_id,
      'taskId', created_task_id,
      'eventType', 'skipped',
      'localDate', '2099-01-01',
      'metadata', true,
      'createdAt', 4070908800000
    ),
    '2099-01-01T00:00:00Z', null, null
  );
  if first_response <> retry_response
    or coalesce((first_response->>'accepted')::boolean, false) is not true
    or (select count(*) from public.task_events where id = task_event_id) <> 1
    or (select metadata from public.task_events where id = task_event_id) <> 'true'::jsonb
    or (select count(*) from public.sync_mutations where user_id = target_user and mutation_id = task_event_mutation) <> 1 then
    raise exception 'native task event was not durably idempotent end to end';
  end if;

  first_response := public.push_sync_mutation_v2(
    target_user, sync_mutation, 'device-a', 'tasks',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 1,
    jsonb_build_object(
      'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'title', 'Synced once',
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-02',
      'completed', false,
      'source', 'manual'
    ),
    '2098-12-01T00:00:00Z', null, null
  );
  retry_response := public.push_sync_mutation_v2(
    target_user, sync_mutation, 'device-a', 'tasks',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 1,
    jsonb_build_object(
      'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'title', 'Synced once',
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-02',
      'completed', false,
      'source', 'manual'
    ),
    '2098-12-01T00:00:00Z', null, null
  );
  if first_response <> retry_response
    or (select count(*) from public.sync_mutations where user_id = target_user and mutation_id = sync_mutation) <> 1 then
    raise exception 'sync retry did not return its exact durable receipt';
  end if;
  mismatch_response := public.push_sync_mutation_v2(
    target_user, sync_mutation, 'device-a', 'tasks',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 1,
    jsonb_build_object(
      'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'title', 'Reused id with different data',
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-02',
      'completed', false,
      'source', 'manual'
    ),
    '2098-12-01T00:00:00Z', null, null
  );
  if coalesce((mismatch_response->>'accepted')::boolean, true)
    or coalesce((mismatch_response->>'replayMismatch')::boolean, false) is not true
    or (select title from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'Synced once' then
    raise exception 'mutation-id reuse overwrote accepted server state';
  end if;

  mismatch_response := public.push_sync_mutation_v2(
    target_user, out_of_order_mutation, 'device-a', 'tasks',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (select server_version from public.sync_records
      where user_id = target_user and entity_type = 'tasks'
        and entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    1,
    jsonb_build_object(
      'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'title', 'Out of order overwrite',
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-02',
      'completed', false,
      'source', 'manual'
    ),
    '2098-12-01T00:00:00Z', null, null
  );
  if coalesce((mismatch_response->>'accepted')::boolean, true)
    or (select title from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'Synced once' then
    raise exception 'out-of-order mutation overwrote newer server state';
  end if;

  conflict_response := public.push_sync_mutation_v2(
    target_user, conflicting_mutation, 'device-b', 'tasks',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 2,
    jsonb_build_object(
      'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'title', 'Conflicting device version',
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-02',
      'completed', false,
      'source', 'manual'
    ),
    '2098-12-02T00:00:00Z', null, null
  );
  if coalesce((conflict_response->>'accepted')::boolean, true)
    or not exists (select 1 from public.sync_conflicts where user_id = target_user and mutation_id = conflicting_mutation)
    or (select title from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'Synced once' then
    raise exception 'same-record conflict did not preserve both sides';
  end if;
  resolution_conflict_id := (conflict_response->>'conflictId')::uuid;
  if (select resolved_at from public.sync_conflicts where id = resolution_conflict_id) is not null then
    raise exception 'a conflict was resolved before either side was explicitly chosen';
  end if;
  first_response := public.push_sync_mutation_v2(
    target_user, resolution_mutation, 'device-b', 'tasks',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (select server_version from public.sync_records
      where user_id = target_user and entity_type = 'tasks'
        and entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    2,
    jsonb_build_object(
      'id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'title', 'Explicitly resolved local version',
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-02',
      'completed', false,
      'source', 'manual'
    ),
    '2098-12-03T00:00:00Z', null, resolution_conflict_id
  );
  if coalesce((first_response->>'accepted')::boolean, false) is not true
    or (select resolved_at from public.sync_conflicts where id = resolution_conflict_id) is null
    or (select title from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'Explicitly resolved local version' then
    raise exception 'explicit conflict resolution was not atomic with the accepted mutation';
  end if;

  first_response := public.push_sync_mutation_v2(
    target_user, plan_mutation, 'device-a', 'daily_plans', '2099-01-02', null, 1,
    jsonb_build_object(
      'id', '2099-01-02',
      'localDate', '2099-01-02',
      'taskIds', jsonb_build_array(created_task_id),
      'confirmedAt', 4070995200000
    ),
    '2099-01-01T00:00:00Z', null, null
  );
  retry_response := public.push_sync_mutation_v2(
    target_user, plan_mutation, 'device-a', 'daily_plans', '2099-01-02', null, 1,
    jsonb_build_object(
      'id', '2099-01-02',
      'localDate', '2099-01-02',
      'taskIds', jsonb_build_array(created_task_id),
      'confirmedAt', 4070995200000
    ),
    '2099-01-01T00:00:00Z', null, null
  );
  if first_response <> retry_response
    or (select count(*) from public.daily_plans where user_id = target_user and local_date = '2099-01-02') <> 1
    or (select count(*) from public.sync_mutations where user_id = target_user and mutation_id = plan_mutation) <> 1 then
    raise exception 'planning decision retry was not idempotent or canonical';
  end if;

  expected_revision := (select revision from public.tasks
    where id = '22222222-2222-4222-8222-222222222222');
  update public.sync_records
  set payload = payload || jsonb_build_object('nativeOnlyState', jsonb_build_object('focusLabel', 'preserve me'))
  where user_id = target_user and entity_type = 'tasks'
    and entity_id = '22222222-2222-4222-8222-222222222222';
  first_response := public.goalflow_reschedule_task_idempotent(
    target_user, reschedule_mutation, '22222222-2222-4222-8222-222222222222',
    '2099-01-01', 'day', '2099-01-03', null, expected_revision
  );
  retry_response := public.goalflow_reschedule_task_idempotent(
    target_user, reschedule_mutation, '22222222-2222-4222-8222-222222222222',
    '2099-01-01', 'day', '2099-01-03', null, expected_revision
  );
  if first_response <> retry_response
    or (select payload->'nativeOnlyState'->>'focusLabel' from public.sync_records
        where user_id = target_user and entity_type = 'tasks'
          and entity_id = '22222222-2222-4222-8222-222222222222') <> 'preserve me' then
    raise exception 'an exact task retry changed its receipt or erased an unknown synchronized field';
  end if;
  begin
    perform public.goalflow_reschedule_task_idempotent(
      target_user, stale_reschedule_mutation, '22222222-2222-4222-8222-222222222222',
      '2099-01-01', 'day', '2099-01-04', null, expected_revision
    );
    raise exception 'stale task mutation unexpectedly succeeded';
  exception when serialization_failure then
    null;
  end;
  if (select scheduled_for from public.tasks where id = '22222222-2222-4222-8222-222222222222') <> '2099-01-03'::date then
    raise exception 'stale task mutation overwrote newer canonical state';
  end if;

  backup_payload := public.export_goalflow_backup(target_user);
  preserved_title := (select title from public.tasks where id = created_task_id);
  begin
    perform public.restore_goalflow_backup(
      target_user,
      jsonb_set(backup_payload, '{tasks,0,title}', 'null'::jsonb, false)
    );
    raise exception 'corrupt restore unexpectedly succeeded';
  exception when not_null_violation or check_violation or invalid_text_representation then
    null;
  end;
  if (select title from public.tasks where id = created_task_id) <> preserved_title then
    raise exception 'failed restore changed valid pre-existing data';
  end if;

  first_response := public.push_sync_mutation_v2(
    target_user, post_backup_sync_mutation, 'device-post-backup', 'goals',
    'post-backup-goal', null, 1,
    jsonb_build_object('id', 'post-backup-goal', 'name', 'Must become a tombstone'),
    '2099-01-05T00:00:00Z', null, null
  );
  perform public.goalflow_create_task_idempotent(
    target_user,
    post_backup_task_mutation,
    '2099-01-05',
    jsonb_build_object(
      'taskId', post_backup_task_id,
      'title', 'Created after backup',
      'notes', '',
      'tags', jsonb_build_array(),
      'schedulePrecision', 'day',
      'scheduledFor', '2099-01-05',
      'plannedOrder', 0,
      'isFrog', false,
      'beforeFrog', false,
      'source', 'manual',
      'estimatedMinutes', 25
    )
  );
  update public.tasks set title = 'Temporary post-backup edit' where id = created_task_id;
  cursor_before_restore := (select max(server_version) from public.sync_records where user_id = target_user);
  perform public.restore_goalflow_backup(target_user, backup_payload);
  if (select title from public.tasks where id = created_task_id) <> preserved_title then
    raise exception 'valid atomic restore did not restore the verified backup';
  end if;
  if not exists (
    select 1 from public.sync_conflicts
    where user_id = target_user
      and entity_type = 'tasks'
      and entity_id = created_task_id::text
      and local_payload->>'title' = 'Temporary post-backup edit'
      and server_payload->>'title' = preserved_title
      and local_deleted_at is null
      and server_deleted_at is null
      and resolved_at is null
  ) then
    raise exception 'restore did not preserve a newer same-record value as an unresolved conflict';
  end if;
  if exists (select 1 from public.tasks where id = post_backup_task_id) then
    raise exception 'restore retained a canonical task absent from the backup';
  end if;
  if not exists (
    select 1 from public.sync_records
    where user_id = target_user and entity_type = 'goals' and entity_id = 'post-backup-goal'
      and deleted_at is not null and server_version > cursor_before_restore
  ) or not exists (
    select 1 from public.sync_records
    where user_id = target_user and entity_type = 'tasks' and entity_id = post_backup_task_id::text
      and deleted_at is not null and server_version > cursor_before_restore
  ) then
    raise exception 'restore did not publish fresh tombstones for records removed by the backup';
  end if;
  if not exists (
    select 1 from public.sync_records
    where user_id = target_user and entity_type = 'tasks' and entity_id = created_task_id::text
      and deleted_at is null and server_version > cursor_before_restore
  ) then
    raise exception 'restore did not rebase restored data beyond every pre-restore client cursor';
  end if;
  if not exists (
    select 1 from public.sync_mutations where user_id = target_user and mutation_id = post_backup_sync_mutation
  ) or not exists (
    select 1 from public.api_mutation_receipts where user_id = target_user and mutation_id = post_backup_task_mutation
  ) then
    raise exception 'restore erased a post-backup idempotency receipt';
  end if;
end;
$$;
