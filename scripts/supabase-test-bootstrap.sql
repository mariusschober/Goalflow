\set ON_ERROR_STOP on

do $$
begin
  create role anon noinherit;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated noinherit;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role service_role noinherit bypassrls;
exception when duplicate_object then null;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner_id text,
  created_at timestamptz not null default now()
);
