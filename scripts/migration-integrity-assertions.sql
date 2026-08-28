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
  created_task_id constant uuid := '99999999-9999-4999-8999-999999999999';
  first_response jsonb;
  retry_response jsonb;
  mismatch_response jsonb;
  conflict_response jsonb;
  backup_payload jsonb;
  preserved_title text;
begin
  if public.goalflow_sync_protocol_version() <> 2 then
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
    or (select count(*) from public.task_events where task_id = created_task_id and event_type = 'created') <> 1 then
    raise exception 'duplicate task request was not idempotent';
  end if;

  first_response := public.goalflow_complete_task_idempotent(
    target_user, completion_mutation, created_task_id, '2099-01-01'
  );
  retry_response := public.goalflow_complete_task_idempotent(
    target_user, completion_mutation, created_task_id, '2099-01-01'
  );
  if first_response <> retry_response
    or (select count(*) from public.task_events where task_id = created_task_id and event_type = 'completed') <> 1 then
    raise exception 'repeated completion was not idempotent';
  end if;

  first_response := public.push_sync_mutation(
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
    '2098-12-01T00:00:00Z', null
  );
  retry_response := public.push_sync_mutation(
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
    '2098-12-01T00:00:00Z', null
  );
  if first_response <> retry_response
    or (select count(*) from public.sync_mutations where user_id = target_user and mutation_id = sync_mutation) <> 1 then
    raise exception 'sync retry did not return its exact durable receipt';
  end if;
  mismatch_response := public.push_sync_mutation(
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
    '2098-12-01T00:00:00Z', null
  );
  if coalesce((mismatch_response->>'accepted')::boolean, true)
    or coalesce((mismatch_response->>'replayMismatch')::boolean, false) is not true
    or (select title from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'Synced once' then
    raise exception 'mutation-id reuse overwrote accepted server state';
  end if;

  mismatch_response := public.push_sync_mutation(
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
    '2098-12-01T00:00:00Z', null
  );
  if coalesce((mismatch_response->>'accepted')::boolean, true)
    or (select title from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'Synced once' then
    raise exception 'out-of-order mutation overwrote newer server state';
  end if;

  conflict_response := public.push_sync_mutation(
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
    '2098-12-02T00:00:00Z', null
  );
  if coalesce((conflict_response->>'accepted')::boolean, true)
    or not exists (select 1 from public.sync_conflicts where user_id = target_user and mutation_id = conflicting_mutation)
    or (select title from public.tasks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'Synced once' then
    raise exception 'same-record conflict did not preserve both sides';
  end if;

  first_response := public.push_sync_mutation(
    target_user, plan_mutation, 'device-a', 'daily_plans', '2099-01-02', null, 1,
    jsonb_build_object(
      'id', '2099-01-02',
      'localDate', '2099-01-02',
      'taskIds', jsonb_build_array(created_task_id),
      'confirmedAt', 4070995200000
    ),
    '2099-01-01T00:00:00Z', null
  );
  retry_response := public.push_sync_mutation(
    target_user, plan_mutation, 'device-a', 'daily_plans', '2099-01-02', null, 1,
    jsonb_build_object(
      'id', '2099-01-02',
      'localDate', '2099-01-02',
      'taskIds', jsonb_build_array(created_task_id),
      'confirmedAt', 4070995200000
    ),
    '2099-01-01T00:00:00Z', null
  );
  if first_response <> retry_response
    or (select count(*) from public.daily_plans where user_id = target_user and local_date = '2099-01-02') <> 1
    or (select count(*) from public.sync_mutations where user_id = target_user and mutation_id = plan_mutation) <> 1 then
    raise exception 'planning decision retry was not idempotent or canonical';
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

  update public.tasks set title = 'Temporary post-backup edit' where id = created_task_id;
  perform public.restore_goalflow_backup(target_user, backup_payload);
  if (select title from public.tasks where id = created_task_id) <> preserved_title then
    raise exception 'valid atomic restore did not restore the verified backup';
  end if;
end;
$$;
