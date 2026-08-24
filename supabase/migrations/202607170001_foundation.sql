create extension if not exists pgcrypto;
create sequence if not exists public.goalflow_change_seq;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'beta' check (role in ('owner', 'beta')),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  timezone text not null default 'UTC',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (length(code_hash) = 64),
  label text not null default '',
  max_uses integer not null default 1 check (max_uses between 1 and 1000),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz not null,
  disabled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.invite_redemptions (
  invite_id uuid not null references public.invite_codes(id) on delete cascade,
  email text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz not null default now(),
  primary key (invite_id, email)
);

create table if not exists public.sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  version integer not null check (version > 0),
  server_version bigint not null default nextval('public.goalflow_change_seq'),
  device_id text,
  payload jsonb not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, entity_type, entity_id)
);
create unique index if not exists sync_records_user_server_version_idx on public.sync_records (user_id, server_version);

create table if not exists public.sync_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  device_id text,
  server_version bigint,
  accepted boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);
create table if not exists public.global_ai_usage (
  usage_date date primary key default current_date,
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.sync_records enable row level security;
alter table public.sync_mutations enable row level security;
alter table public.ai_usage enable row level security;
alter table public.global_ai_usage enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select using (auth.uid() = user_id);
drop policy if exists "users own sync records" on public.sync_records;
create policy "users own sync records" on public.sync_records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.invite_codes from anon, authenticated;
revoke all on public.invite_redemptions from anon, authenticated;
revoke all on public.sync_mutations from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;
revoke all on public.global_ai_usage from anon, authenticated;

create or replace function public.consume_ai_quota(
  target_user_id uuid,
  target_user_limit integer,
  target_global_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
  global_count integer;
begin
  insert into public.ai_usage (user_id, usage_date, request_count) values (target_user_id, current_date, 0)
  on conflict (user_id, usage_date) do nothing;
  insert into public.global_ai_usage (usage_date, request_count) values (current_date, 0)
  on conflict (usage_date) do nothing;
  select request_count into user_count from public.ai_usage
  where user_id = target_user_id and usage_date = current_date for update;
  select request_count into global_count from public.global_ai_usage
  where usage_date = current_date for update;
  if user_count >= target_user_limit or global_count >= target_global_limit then return false; end if;
  update public.ai_usage set request_count = request_count + 1 where user_id = target_user_id and usage_date = current_date;
  update public.global_ai_usage set request_count = request_count + 1 where usage_date = current_date;
  return true;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, integer) to service_role;
