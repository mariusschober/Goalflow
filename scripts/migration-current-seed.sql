\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at)
values ('11111111-1111-4111-8111-111111111111', 'migration@example.com', now());
insert into public.profiles (user_id, email, timezone)
values ('11111111-1111-4111-8111-111111111111', 'migration@example.com', 'Pacific/Kiritimati');
insert into public.tasks (
  id, user_id, title, schedule_precision, scheduled_for, source
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Preserve seeded task', 'day', '2099-01-01', 'manual'
);
insert into public.daily_plans (user_id, local_date, task_ids, confirmed_at)
values (
  '11111111-1111-4111-8111-111111111111', '2099-01-01',
  array['22222222-2222-4222-8222-222222222222'::uuid], now()
);
insert into public.sync_records (
  user_id, entity_type, entity_id, version, server_version, device_id, payload, updated_at
) values (
  '11111111-1111-4111-8111-111111111111', 'goals', 'legacy-goal', 1,
  nextval('public.goalflow_change_seq'), 'old-device', '{"id":"legacy-goal","name":"Preserve"}', now()
);
insert into public.sync_mutations (
  user_id, mutation_id, device_id, server_version, accepted
) values (
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333', 'old-device', 1, true
);
insert into public.sync_conflicts (
  user_id, entity_type, entity_id, mutation_id, base_server_version,
  server_version, local_payload, server_payload
) values (
  '11111111-1111-4111-8111-111111111111', 'goals', 'legacy-goal',
  '44444444-4444-4444-8444-444444444444', 1, 2,
  '{"name":"local"}', '{"name":"cloud"}'
);
