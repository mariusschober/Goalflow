-- Telegram rich capture: time/duration/tags + forward source preservation
-- Additive, no backfill, no Sync impact. All new columns nullable/default so existing rows remain valid.

alter table public.telegram_captures
  add column if not exists scheduled_time time,
  add column if not exists estimated_minutes integer check (estimated_minutes between 1 and 1440),
  add column if not exists tags text[] not null default '{}',
  add column if not exists forward_origin jsonb,
  add column if not exists forwarded_text text;

-- Allow kind='forwarded' for explicit forwarded captures, keep backward compat for 'text'/'voice'
alter table public.telegram_captures drop constraint if exists telegram_captures_kind_check;
alter table public.telegram_captures
  add constraint telegram_captures_kind_check check (kind in ('text', 'voice', 'forwarded'));

-- Tasks: minimal forward_source preservation (additive, nullable, no RLS change)
-- Sync will include it automatically via tasks row (if Sync payload includes tasks.*). Keep separate from Sync hardening.
alter table public.tasks
  add column if not exists forward_source jsonb;

-- Index for forward source lookups (optional)
create index if not exists tasks_forward_source_idx on public.tasks using gin (forward_source) where forward_source is not null;
