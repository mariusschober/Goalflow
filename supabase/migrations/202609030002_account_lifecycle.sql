-- Forward-only account lifecycle and immediate session-revocation support.

begin;

create table public.email_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invite_codes(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  state text not null default 'pending' check (state in ('pending', 'used', 'expired')),
  expires_at timestamptz not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index email_auth_attempts_pending_email_idx
  on public.email_auth_attempts (lower(email), expires_at desc)
  where state = 'pending';

alter table public.email_auth_attempts enable row level security;
revoke all privileges on table public.email_auth_attempts from anon, authenticated;
grant all privileges on table public.email_auth_attempts to service_role;

create or replace function public.goalflow_account_protocol_version()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$ select 1; $$;

-- Redeem an invite and create every access-bearing row in one transaction.
-- A retry after a lost HTTP acknowledgment returns true only for the exact
-- user, email, and already-consumed attempt.
create or replace function public.activate_goalflow_email_beta(
  target_attempt_id uuid,
  target_user_id uuid,
  target_email text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  attempt public.email_auth_attempts%rowtype;
  invite public.invite_codes%rowtype;
  normalized_email text := lower(btrim(target_email));
  redemption_user_id uuid;
begin
  select * into attempt
  from public.email_auth_attempts
  where id = target_attempt_id
  for update;

  if not found or lower(attempt.email) <> normalized_email then
    return false;
  end if;
  if attempt.state = 'used' then
    return attempt.auth_user_id = target_user_id
      and exists (
        select 1 from public.profiles profile
        where profile.user_id = target_user_id
          and lower(profile.email) = normalized_email
          and profile.status = 'active'
      );
  end if;
  if attempt.state <> 'pending' or attempt.expires_at <= now() then
    update public.email_auth_attempts
    set state = 'expired'
    where id = attempt.id and state = 'pending';
    return false;
  end if;
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = target_user_id
      and lower(auth_user.email) = normalized_email
      and auth_user.email_confirmed_at is not null
  ) then
    return false;
  end if;
  if exists (select 1 from public.profiles where user_id = target_user_id) then
    return false;
  end if;

  select * into invite
  from public.invite_codes
  where id = attempt.invite_id
    and disabled_at is null
    and expires_at > now()
    and use_count < max_uses
  for update;
  if not found then
    return false;
  end if;

  insert into public.invite_redemptions (invite_id, email, auth_user_id)
  values (invite.id, normalized_email, target_user_id)
  on conflict (invite_id, email) do nothing
  returning auth_user_id into redemption_user_id;
  if redemption_user_id is distinct from target_user_id then
    return false;
  end if;

  update public.invite_codes
  set use_count = use_count + 1
  where id = invite.id;

  insert into public.profiles (user_id, email, role, status, invited_by)
  values (target_user_id, normalized_email, 'beta', 'active', invite.created_by);
  insert into public.entitlements (user_id, plan, active)
  values (target_user_id, 'full_beta', true);
  update public.email_auth_attempts
  set state = 'used', auth_user_id = target_user_id, used_at = now()
  where id = attempt.id and state = 'pending';
  if not found then
    raise exception using errcode = '40001', message = 'Email activation changed concurrently';
  end if;
  return true;
end;
$$;

-- Owner creation is bound to the immutable configured UUID by the server. The
-- function independently requires that UUID to be a confirmed Auth user and
-- creates the owner profile plus entitlement atomically.
create or replace function public.bootstrap_goalflow_owner(
  target_user_id uuid,
  target_email text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_email text := lower(btrim(target_email));
  existing_profile public.profiles%rowtype;
begin
  if not exists (
    select 1 from auth.users auth_user
    where auth_user.id = target_user_id
      and lower(auth_user.email) = normalized_email
      and auth_user.email_confirmed_at is not null
  ) then
    return false;
  end if;
  select * into existing_profile
  from public.profiles
  where user_id = target_user_id
  for update;
  if found then
    return existing_profile.role = 'owner'
      and existing_profile.status = 'active';
  end if;
  insert into public.profiles (user_id, email, role, status)
  values (target_user_id, normalized_email, 'owner', 'active');
  insert into public.entitlements (user_id, plan, active)
  values (target_user_id, 'full_beta', true);
  return true;
end;
$$;

-- Supabase access JWTs contain session_id. Auth sign-out destroys the matching
-- auth.sessions row even though the access JWT itself remains valid until exp.
-- Checking both user and session makes remote/global logout immediate at the
-- Goalflow API boundary.
create or replace function public.goalflow_session_is_active(
  target_user_id uuid,
  target_session_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, auth
as $$
  select exists (
    select 1
    from auth.sessions session_row
    where session_row.id = target_session_id
      and session_row.user_id = target_user_id
  );
$$;

revoke all on function public.activate_goalflow_email_beta(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.goalflow_account_protocol_version()
from public, anon, authenticated, service_role;
revoke all on function public.bootstrap_goalflow_owner(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.goalflow_session_is_active(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.activate_goalflow_email_beta(uuid, uuid, text) to service_role;
grant execute on function public.goalflow_account_protocol_version() to service_role;
grant execute on function public.bootstrap_goalflow_owner(uuid, text) to service_role;
grant execute on function public.goalflow_session_is_active(uuid, uuid) to service_role;

commit;
