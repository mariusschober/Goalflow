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
