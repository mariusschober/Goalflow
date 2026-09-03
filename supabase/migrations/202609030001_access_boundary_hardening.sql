-- Forward-only access-boundary hardening.
--
-- Goalflow clients authenticate with Supabase, but all application data flows
-- through the Goalflow API. The API uses the server-only service role and
-- derives the effective user id from a verified access token. No browser or
-- native client needs direct PostgREST or Storage access to these objects.

begin;

-- An untrusted role must not be able to shadow an unqualified object used by
-- a SECURITY DEFINER function. Existing functions retain public in their
-- search path for compatibility, but public is made non-writable first.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- RLS remains enabled as defense in depth. Direct Data API privileges are
-- removed as well so a client cannot bypass mutation receipts, tombstones, or
-- server ownership checks by writing a table directly.
alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.sync_records enable row level security;
alter table public.sync_mutations enable row level security;
alter table public.ai_usage enable row level security;
alter table public.global_ai_usage enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_plans enable row level security;
alter table public.task_events enable row level security;
alter table public.telegram_identities enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.telegram_auth_attempts enable row level security;
alter table public.telegram_captures enable row level security;
alter table public.entitlements enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.backup_metadata enable row level security;
alter table public.api_mutation_receipts enable row level security;

revoke all privileges on table
  public.profiles,
  public.invite_codes,
  public.invite_redemptions,
  public.sync_records,
  public.sync_mutations,
  public.ai_usage,
  public.global_ai_usage,
  public.tasks,
  public.daily_plans,
  public.task_events,
  public.telegram_identities,
  public.telegram_updates,
  public.telegram_auth_attempts,
  public.telegram_captures,
  public.entitlements,
  public.sync_conflicts,
  public.backup_metadata,
  public.api_mutation_receipts
from anon, authenticated;

grant all privileges on table
  public.profiles,
  public.invite_codes,
  public.invite_redemptions,
  public.sync_records,
  public.sync_mutations,
  public.ai_usage,
  public.global_ai_usage,
  public.tasks,
  public.daily_plans,
  public.task_events,
  public.telegram_identities,
  public.telegram_updates,
  public.telegram_auth_attempts,
  public.telegram_captures,
  public.entitlements,
  public.sync_conflicts,
  public.backup_metadata,
  public.api_mutation_receipts
to service_role;

revoke all privileges on sequence
  public.goalflow_change_seq,
  public.goalflow_task_revision_seq
from anon, authenticated;
grant usage, select, update on sequence
  public.goalflow_change_seq,
  public.goalflow_task_revision_seq
to service_role;

-- Backups are private server-managed objects. Absence of a client policy is
-- intentional; both SQL privileges and Storage RLS deny direct client access.
alter table storage.objects enable row level security;
revoke all privileges on table storage.objects, storage.buckets from anon, authenticated;
grant all privileges on table storage.objects, storage.buckets to service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Revoke all
-- current direct RPC access, then expose only the server entry points that the
-- Goalflow API actually invokes. Internal projection functions must never be
-- callable with an arbitrary target_user_id from a client token.
revoke execute on all functions in schema public from public, anon, authenticated, service_role;

grant execute on function public.consume_ai_quota(uuid, integer, integer) to service_role;
grant execute on function public.goalflow_sync_protocol_version() to service_role;
grant execute on function public.push_sync_mutation_v2(
  uuid, uuid, text, text, text, bigint, integer, jsonb, timestamptz, timestamptz, uuid
) to service_role;
grant execute on function public.export_goalflow_backup(uuid) to service_role;
grant execute on function public.restore_goalflow_backup(uuid, jsonb) to service_role;
grant execute on function public.goalflow_create_task_idempotent(uuid, uuid, date, jsonb) to service_role;
grant execute on function public.goalflow_complete_task_idempotent(uuid, uuid, uuid, date, bigint) to service_role;
grant execute on function public.goalflow_skip_task_idempotent(uuid, uuid, uuid, date, bigint) to service_role;
grant execute on function public.goalflow_drop_task_idempotent(uuid, uuid, uuid, date, bigint) to service_role;
grant execute on function public.goalflow_reschedule_task_idempotent(
  uuid, uuid, uuid, date, text, date, time, bigint
) to service_role;
grant execute on function public.goalflow_break_down_task_idempotent(
  uuid, uuid, uuid, jsonb, bigint
) to service_role;
grant execute on function public.goalflow_confirm_plan_idempotent(
  uuid, uuid, date, uuid[], bigint
) to service_role;
grant execute on function public.activate_telegram_beta(
  text, uuid, bigint, text, text, text
) to service_role;

-- Give every SECURITY DEFINER function a fixed, trusted lookup order. pgcrypto
-- may live in public on stock PostgreSQL or extensions on hosted Supabase.
do $goalflow_harden_definers$
declare
  secured_function regprocedure;
begin
  for secured_function in
    select function_row.oid::regprocedure
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.prosecdef
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, extensions',
      secured_function
    );
  end loop;
end;
$goalflow_harden_definers$;

-- Durable task relations must never cross an account boundary, even when a
-- privileged maintenance path or restore function supplies the rows.
alter table public.tasks
  add constraint tasks_user_id_id_unique unique (user_id, id);
alter table public.tasks
  add constraint tasks_parent_same_owner_fk
  foreign key (user_id, parent_task_id)
  references public.tasks (user_id, id)
  deferrable initially immediate;
alter table public.task_events
  add constraint task_events_task_same_owner_fk
  foreign key (user_id, task_id)
  references public.tasks (user_id, id)
  deferrable initially immediate;

create or replace function public.validate_goalflow_daily_plan_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from unnest(new.task_ids) planned_task_id
    where not exists (
      select 1
      from public.tasks task
      where task.user_id = new.user_id
        and task.id = planned_task_id
    )
  ) then
    raise exception using
      errcode = '23503',
      message = 'Daily plan contains a task not owned by this account';
  end if;
  if cardinality(new.task_ids) <> (
    select count(distinct planned_task_id)
    from unnest(new.task_ids) planned_task_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Daily plan contains a duplicate task identity';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_goalflow_daily_plan_ownership()
from public, anon, authenticated, service_role;

drop trigger if exists validate_goalflow_daily_plan_ownership_trigger on public.daily_plans;
create trigger validate_goalflow_daily_plan_ownership_trigger
before insert or update of user_id, task_ids on public.daily_plans
for each row execute function public.validate_goalflow_daily_plan_ownership();

-- Future migration-created objects start closed. A later public API addition
-- must grant its server entry point deliberately in the same migration.
alter default privileges in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
