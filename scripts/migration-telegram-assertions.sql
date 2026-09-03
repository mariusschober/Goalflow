\set ON_ERROR_STOP on

do $$
declare
  update_id constant bigint := 900000000000000101;
  retry_update_id constant bigint := 900000000000000102;
  first_lease constant uuid := '30303030-3030-4030-8030-303030303030';
  second_lease constant uuid := '31313131-3131-4131-8131-313131313131';
  claim_result text;
begin
  if has_function_privilege(
    'authenticated',
    'public.goalflow_claim_telegram_update(bigint,bigint,jsonb,uuid,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.goalflow_complete_telegram_update(bigint,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Telegram webhook claim RPC is exposed to browser clients';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.goalflow_claim_telegram_update(bigint,bigint,jsonb,uuid,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.goalflow_complete_telegram_update(bigint,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Telegram webhook claim RPC is unavailable to the server role';
  end if;

  claim_result := public.goalflow_claim_telegram_update(
    update_id, 42, '{"update_id":900000000000000101,"message":{"text":"first"}}', first_lease, 60
  );
  if claim_result <> 'claimed' then raise exception 'New Telegram update was not claimed'; end if;

  claim_result := public.goalflow_claim_telegram_update(
    update_id, 42, '{"message":{"text":"first"},"update_id":900000000000000101}', second_lease, 60
  );
  if claim_result <> 'busy' then raise exception 'Concurrent Telegram update claim was not excluded'; end if;

  claim_result := public.goalflow_claim_telegram_update(
    update_id, 42, '{"update_id":900000000000000101,"message":{"text":"tampered"}}', second_lease, 60
  );
  if claim_result <> 'collision' then raise exception 'Telegram update id collision was not rejected'; end if;

  if public.goalflow_complete_telegram_update(update_id, second_lease, 'processed', null) then
    raise exception 'Wrong Telegram processing lease completed an update';
  end if;
  if not public.goalflow_complete_telegram_update(update_id, first_lease, 'processed', null) then
    raise exception 'Exact Telegram processing lease did not complete';
  end if;
  claim_result := public.goalflow_claim_telegram_update(
    update_id, 42, '{"update_id":900000000000000101,"message":{"text":"first"}}', second_lease, 60
  );
  if claim_result <> 'duplicate' then raise exception 'Completed Telegram update was not deduplicated'; end if;

  claim_result := public.goalflow_claim_telegram_update(
    retry_update_id, 42, '{"update_id":900000000000000102}', first_lease, 60
  );
  if claim_result <> 'claimed'
    or not public.goalflow_complete_telegram_update(retry_update_id, first_lease, 'error', 'test_failure') then
    raise exception 'Telegram retry fixture could not record its failed attempt';
  end if;
  claim_result := public.goalflow_claim_telegram_update(
    retry_update_id, 42, '{"update_id":900000000000000102}', second_lease, 60
  );
  if claim_result <> 'claimed' then raise exception 'Failed Telegram update could not be reclaimed'; end if;
  if (select attempt_count from public.telegram_updates where telegram_updates.update_id = retry_update_id) <> 2 then
    raise exception 'Telegram retry attempt count is not durable';
  end if;
  if not public.goalflow_complete_telegram_update(retry_update_id, second_lease, 'processed', null) then
    raise exception 'Reclaimed Telegram update did not complete';
  end if;
end;
$$;

do $$
declare
  target_user constant uuid := '11111111-1111-4111-8111-111111111111';
  other_user constant uuid := '44444444-4444-4444-8444-444444444444';
  capture_id constant uuid := '35353535-3535-4535-8535-353535353535';
  failed_capture_id constant uuid := '36363636-3636-4636-8636-363636363636';
  mutation_id constant uuid := '37373737-3737-4737-8737-373737373737';
  failed_mutation_id constant uuid := '38383838-3838-4838-8838-383838383838';
  task_payload jsonb;
  first_response jsonb;
  retry_response jsonb;
  denied boolean := false;
begin
  insert into public.telegram_captures (
    id, user_id, telegram_chat_id, kind, title, transcript,
    schedule_precision, scheduled_for, state, expires_at
  ) values (
    capture_id, target_user, 4242, 'text', 'Atomic Telegram task',
    '{"goalflowTelegramCapture":1}', 'day', '2099-01-06', 'pending',
    clock_timestamp() + interval '15 minutes'
  );
  task_payload := jsonb_build_object(
    'taskId', capture_id,
    'title', 'Atomic Telegram task',
    'notes', '',
    'tags', jsonb_build_array('telegram'),
    'schedulePrecision', 'day',
    'scheduledFor', '2099-01-06',
    'plannedOrder', 0,
    'isFrog', false,
    'beforeFrog', false,
    'source', 'telegram',
    'estimatedMinutes', 30
  );
  first_response := public.goalflow_confirm_telegram_capture(
    target_user, capture_id, mutation_id, '2099-01-06', task_payload
  );
  if first_response->>'id' <> capture_id::text
    or first_response->>'user_id' <> target_user::text
    or first_response->>'source' <> 'telegram'
    or (select state from public.telegram_captures where id = capture_id) <> 'confirmed'
    or not exists (
      select 1 from public.tasks
      where id = capture_id and user_id = target_user and title = 'Atomic Telegram task'
    ) then
    raise exception 'Telegram capture and task were not committed atomically';
  end if;
  retry_response := public.goalflow_confirm_telegram_capture(
    target_user, capture_id, mutation_id, '2099-01-06', task_payload
  );
  if retry_response <> first_response
    or (select count(*) from public.tasks where id = capture_id) <> 1
    or (select count(*) from public.task_events where task_id = capture_id and event_type = 'created') <> 1 then
    raise exception 'Telegram capture retry was not idempotent';
  end if;

  begin
    perform public.goalflow_confirm_telegram_capture(
      other_user, capture_id, mutation_id, '2099-01-06', task_payload
    );
  exception when others then
    denied := true;
  end;
  if not denied then raise exception 'Telegram capture crossed the account boundary'; end if;

  insert into public.telegram_captures (
    id, user_id, telegram_chat_id, kind, title, transcript,
    schedule_precision, scheduled_for, state, expires_at
  ) values (
    failed_capture_id, target_user, 4242, 'text', 'Must remain pending',
    null, 'day', '2099-01-06', 'pending', clock_timestamp() + interval '15 minutes'
  );
  begin
    perform public.goalflow_confirm_telegram_capture(
      target_user,
      failed_capture_id,
      failed_mutation_id,
      '2099-01-06',
      jsonb_build_object(
        'taskId', failed_capture_id,
        'title', 'Different title',
        'schedulePrecision', 'day',
        'scheduledFor', '2099-01-06',
        'source', 'telegram'
      )
    );
  exception when others then
    denied := true;
  end;
  if (select state from public.telegram_captures where id = failed_capture_id) <> 'pending'
    or exists (select 1 from public.tasks where id = failed_capture_id) then
    raise exception 'Failed Telegram confirmation left partial durable state';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.goalflow_confirm_telegram_capture(uuid,uuid,uuid,date,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.goalflow_confirm_telegram_capture(uuid,uuid,uuid,date,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Telegram capture confirmation RPC privilege boundary is invalid';
  end if;
end;
$$;

do $$
declare
  target_user constant uuid := '11111111-1111-4111-8111-111111111111';
  other_user constant uuid := '44444444-4444-4444-8444-444444444444';
  session_id constant uuid := '34343434-3434-4434-8434-343434343434';
  token_hash constant text := repeat('d', 64);
  init_hash constant text := repeat('e', 64);
  revoke_result boolean;
begin
  insert into public.telegram_identities (
    telegram_user_id, user_id, telegram_username, bot_access_granted
  ) values (4242, target_user, 'migration_test', true)
  on conflict (user_id) do update set
    telegram_user_id = excluded.telegram_user_id,
    bot_access_granted = true,
    updated_at = now();
  insert into auth.users (id, email) values (other_user, 'telegram-other@example.invalid')
  on conflict (id) do nothing;
  insert into public.profiles (user_id, email, timezone, role, status)
  values (other_user, 'telegram-other@example.invalid', 'UTC', 'beta', 'active')
  on conflict (user_id) do nothing;

  if public.goalflow_link_telegram_identity(other_user, 4242, 'attacker') then
    raise exception 'Telegram identity was linked to a second Goalflow account';
  end if;
  if (select user_id from public.telegram_identities where telegram_user_id = 4242) <> target_user then
    raise exception 'Failed cross-account link changed Telegram ownership';
  end if;

  if (public.goalflow_create_telegram_mini_session(
    session_id, token_hash, init_hash, 4242, clock_timestamp(),
    clock_timestamp() + interval '15 minutes'
  )->>'state') <> 'created' then
    raise exception 'Telegram relink session fixture was not created';
  end if;
  if not public.goalflow_link_telegram_identity(target_user, 4243, 'replacement') then
    raise exception 'Telegram identity could not be safely relinked for its owner';
  end if;
  if public.goalflow_validate_telegram_mini_session(token_hash) is not null then
    raise exception 'Relinking Telegram preserved a cached Mini App session';
  end if;
  if (select telegram_user_id from public.telegram_identities where user_id = target_user) <> 4243 then
    raise exception 'Telegram relink did not preserve exact ownership';
  end if;
  -- Do not combine the mutating RPC and the state read in one boolean
  -- expression: PostgreSQL does not guarantee subexpression evaluation order.
  revoke_result := public.goalflow_revoke_user_telegram_access(target_user);
  if revoke_result is not true
    or (select bot_access_granted from public.telegram_identities where user_id = target_user) is not false then
    raise exception 'Telegram unlink did not revoke bot access';
  end if;
  if has_function_privilege('authenticated', 'public.goalflow_link_telegram_identity(uuid,bigint,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.goalflow_link_telegram_identity(uuid,bigint,text)', 'EXECUTE') then
    raise exception 'Telegram link RPC privilege boundary is invalid';
  end if;
end;
$$;

do $$
declare
  target_user constant uuid := '11111111-1111-4111-8111-111111111111';
  session_id constant uuid := '32323232-3232-4232-8232-323232323232';
  replay_session_id constant uuid := '33333333-3333-4333-8333-333333333333';
  token_hash constant text := repeat('a', 64);
  replay_token_hash constant text := repeat('b', 64);
  init_hash constant text := repeat('c', 64);
  session_result jsonb;
begin
  insert into public.telegram_identities (
    telegram_user_id, user_id, telegram_username, bot_access_granted
  ) values (4242, target_user, 'migration_test', true)
  on conflict (user_id) do update set
    telegram_user_id = excluded.telegram_user_id,
    bot_access_granted = true,
    updated_at = now();

  session_result := public.goalflow_create_telegram_mini_session(
    session_id, token_hash, init_hash, 4242, clock_timestamp(),
    clock_timestamp() + interval '15 minutes'
  );
  if session_result->>'state' <> 'created'
    or session_result->>'userId' <> target_user::text
    or (session_result->>'telegramUserId')::bigint <> 4242 then
    raise exception 'Telegram initData did not create an exact linked session';
  end if;

  session_result := public.goalflow_create_telegram_mini_session(
    replay_session_id, replay_token_hash, init_hash, 4242, clock_timestamp(),
    clock_timestamp() + interval '15 minutes'
  );
  if session_result->>'state' <> 'replay' then
    raise exception 'Telegram initData replay was not rejected';
  end if;

  session_result := public.goalflow_validate_telegram_mini_session(token_hash);
  if session_result->>'userId' <> target_user::text
    or (session_result->>'telegramUserId')::bigint <> 4242 then
    raise exception 'Telegram Mini App token was not bound to the exact linked account';
  end if;

  update public.profiles set status = 'suspended' where user_id = target_user;
  if public.goalflow_validate_telegram_mini_session(token_hash) is not null then
    raise exception 'Suspended account retained a cached Telegram Mini App session';
  end if;
  update public.profiles set status = 'active' where user_id = target_user;

  if not public.goalflow_revoke_telegram_mini_session(token_hash)
    or public.goalflow_validate_telegram_mini_session(token_hash) is not null then
    raise exception 'Revoked Telegram Mini App session remained usable';
  end if;

  if has_table_privilege('authenticated', 'public.telegram_mini_sessions', 'SELECT,INSERT,UPDATE,DELETE')
    or has_function_privilege('authenticated', 'public.goalflow_create_telegram_mini_session(uuid,text,text,bigint,timestamptz,timestamptz)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.goalflow_validate_telegram_mini_session(text)', 'EXECUTE') then
    raise exception 'Telegram Mini App security records are exposed to browser clients';
  end if;
  if not has_function_privilege('service_role', 'public.goalflow_create_telegram_mini_session(uuid,text,text,bigint,timestamptz,timestamptz)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.goalflow_validate_telegram_mini_session(text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.goalflow_revoke_telegram_mini_session(text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.goalflow_revoke_user_telegram_access(uuid)', 'EXECUTE') then
    raise exception 'Telegram Mini App RPC boundary is incomplete';
  end if;
end;
$$;
