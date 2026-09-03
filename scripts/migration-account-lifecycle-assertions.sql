\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, email_confirmed_at)
values
  ('33333333-1111-4111-8111-111111111111', 'beta-c@example.invalid', now()),
  ('44444444-1111-4111-8111-111111111111', 'owner-d@example.invalid', now()),
  ('55555555-1111-4111-8111-111111111111', 'unconfirmed@example.invalid', null);

insert into auth.sessions (id, user_id)
values (
  '33333333-2222-4222-8222-222222222222',
  '33333333-1111-4111-8111-111111111111'
);

insert into public.invite_codes (
  id, code_hash, label, max_uses, expires_at, created_by
) values (
  '33333333-3333-4333-8333-333333333333',
  repeat('a', 64), 'Email lifecycle test', 1, now() + interval '1 day',
  '11111111-1111-4111-8111-111111111111'
);
insert into public.email_auth_attempts (
  id, invite_id, email, expires_at
) values (
  '33333333-4444-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333333',
  'beta-c@example.invalid',
  now() + interval '1 hour'
);

do $$
declare
  first_result boolean;
  retry_result boolean;
begin
  first_result := public.activate_goalflow_email_beta(
    '33333333-4444-4333-8333-333333333333',
    '33333333-1111-4111-8111-111111111111',
    'BETA-C@example.invalid'
  );
  retry_result := public.activate_goalflow_email_beta(
    '33333333-4444-4333-8333-333333333333',
    '33333333-1111-4111-8111-111111111111',
    'beta-c@example.invalid'
  );
  if first_result is not true or retry_result is not true then
    raise exception 'Email invite activation or its exact retry failed';
  end if;
  if (select use_count from public.invite_codes where id = '33333333-3333-4333-8333-333333333333') <> 1 then
    raise exception 'Email activation consumed an invite more than once';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = '33333333-1111-4111-8111-111111111111'
      and role = 'beta' and status = 'active'
  ) or not exists (
    select 1 from public.entitlements
    where user_id = '33333333-1111-4111-8111-111111111111' and active
  ) then
    raise exception 'Email activation did not atomically bootstrap access';
  end if;

  if public.goalflow_session_is_active(
    '33333333-1111-4111-8111-111111111111',
    '33333333-2222-4222-8222-222222222222'
  ) is not true then
    raise exception 'Live Auth session was rejected';
  end if;
  delete from auth.sessions
  where id = '33333333-2222-4222-8222-222222222222';
  if public.goalflow_session_is_active(
    '33333333-1111-4111-8111-111111111111',
    '33333333-2222-4222-8222-222222222222'
  ) is not false then
    raise exception 'Revoked Auth session remained active';
  end if;

  if public.bootstrap_goalflow_owner(
    '44444444-1111-4111-8111-111111111111',
    'owner-d@example.invalid'
  ) is not true or public.bootstrap_goalflow_owner(
    '44444444-1111-4111-8111-111111111111',
    'owner-d@example.invalid'
  ) is not true then
    raise exception 'Owner bootstrap was not idempotent';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = '44444444-1111-4111-8111-111111111111'
      and role = 'owner' and status = 'active'
  ) or not exists (
    select 1 from public.entitlements
    where user_id = '44444444-1111-4111-8111-111111111111' and active
  ) then
    raise exception 'Owner bootstrap did not atomically create access';
  end if;
  if public.bootstrap_goalflow_owner(
    '55555555-1111-4111-8111-111111111111',
    'unconfirmed@example.invalid'
  ) is not false then
    raise exception 'Unconfirmed Auth user became owner';
  end if;
end;
$$;

rollback;
