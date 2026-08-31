-- Forward-only hardening migration. Do not edit already-applied migrations.
-- Month-only scheduling is evaluated in the user's configured local timezone,
-- not the database server's UTC calendar.
create or replace function public.validate_goalflow_task_schedule()
returns trigger
language plpgsql
as $$
declare
  profile_timezone text;
  local_today date;
begin
  select timezone into profile_timezone
  from public.profiles
  where user_id = new.user_id;

  begin
    local_today := (now() at time zone coalesce(nullif(profile_timezone, ''), 'UTC'))::date;
  exception when invalid_parameter_value then
    local_today := current_date;
  end;

  if new.schedule_precision = 'month' then
    if new.scheduled_for <= date_trunc('month', local_today)::date then
      raise exception using
        errcode = '22023',
        message = 'Month-only tasks must use a future month';
    end if;
    new.scheduled_time := null;
  end if;

  if tg_op = 'UPDATE' and old.is_frog and not new.is_frog then
    raise exception using errcode = '22023', message = 'A frog cannot be unmarked';
  end if;

  if tg_op = 'UPDATE' and old.status = 'open' and new.status = 'open'
    and new.scheduled_for > old.scheduled_for then
    if old.is_frog then
      raise exception using errcode = '22023', message = 'Frogs cannot be moved forward';
    end if;
    new.frog_failures := greatest(new.frog_failures, old.frog_failures + 1);
    if new.frog_failures >= 2 then
      new.is_frog := true;
    end if;
  end if;

  if tg_op = 'UPDATE' and new is distinct from old then
    new.updated_at := now();
    new.revision := nextval('public.goalflow_task_revision_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists validate_goalflow_task_schedule_trigger on public.tasks;
create trigger validate_goalflow_task_schedule_trigger
before insert or update on public.tasks
for each row execute function public.validate_goalflow_task_schedule();
