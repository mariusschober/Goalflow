-- Secure callback flow: bind telegram signup attempt to OAuth state and PKCE.
-- Forward-only, additive. Existing rows remain pending with null state.
alter table public.telegram_auth_attempts
  add column if not exists oauth_state_hash text check (oauth_state_hash is null or length(oauth_state_hash) = 64),
  add column if not exists code_challenge text check (code_challenge is null or length(code_challenge) between 43 and 128),
  add column if not exists code_challenge_method text check (code_challenge_method is null or code_challenge_method in ('S256', 'plain'));

create index if not exists telegram_auth_attempts_state_hash_idx
  on public.telegram_auth_attempts (oauth_state_hash) where oauth_state_hash is not null;

-- Harden activate_telegram_beta to require state binding when present
create or replace function public.activate_telegram_beta(
  target_token_hash text,
  target_user_id uuid,
  target_telegram_user_id bigint,
  target_telegram_username text,
  target_email text,
  target_oauth_state text default null
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
  expected_state_hash text;
begin
  select * into attempt from public.telegram_auth_attempts
  where token_hash = target_token_hash and state = 'pending' and expires_at > now()
  for update;
  if not found then return false; end if;

  -- If the attempt was created with an OAuth state, the caller must provide the same state.
  if attempt.oauth_state_hash is not null then
    if target_oauth_state is null or length(target_oauth_state) = 0 then
      return false;
    end if;
    expected_state_hash := encode(digest(target_oauth_state, 'sha256'), 'hex');
    if expected_state_hash <> attempt.oauth_state_hash then
      return false;
    end if;
  end if;

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

revoke all on function public.activate_telegram_beta(text, uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.activate_telegram_beta(text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.activate_telegram_beta(text, uuid, bigint, text, text, text) to service_role;
grant execute on function public.activate_telegram_beta(text, uuid, bigint, text, text) to service_role;
