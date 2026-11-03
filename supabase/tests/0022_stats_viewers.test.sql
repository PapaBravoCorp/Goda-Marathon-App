-- Tests for 0022_stats_viewers.sql. Run by run-db-tests.sh after every
-- migration has been applied to a throwaway database.
--
-- Each block acts as one kind of caller the way the API does: SET ROLE to the
-- PostgREST role and put the user's id in request.jwt.claims, which is what
-- auth.uid() reads. Every block ends in ROLLBACK, so tests cannot leak into
-- each other. A failed check raises, and psql stops there.

\set ON_ERROR_STOP 1

-- ── Fixtures (as the migration owner) ───────────────────────────────────────

\ir helpers.sql

-- Data. Triggers are switched off while seeding so the fixtures are exactly
-- what is written here (no bib numbering, no email queue).
set session_replication_role = replica;

insert into public.events (id, name) values
  ('test-2026', 'Test Run 2026'),
  ('other-2026', 'Another Event');

insert into public.coupons (event_id, code, discount_value) values
  ('test-2026', 'EARLY20', 20),
  ('test-2026', 'CLUB10', 10);

insert into public.registration_groups (group_code, event_id, captain_first_name, captain_email)
values ('GRP-TEST', 'test-2026', 'Captain', 'captain@test.local');

-- Times are UTC. India is UTC+05:30, so the 18:00 and 18:45 UTC entries on
-- 1 Nov are 23:30 on 1 Nov and 00:15 on 2 Nov in India.
insert into public.registrations
  (first_name, email, phone, category, coupon_code, payment_status, price, event_id, created_at)
values
  ('Asha',  'r1@test.local', '9000000001', '10K', null,      'PAID',      500, 'test-2026',  '2026-10-30 04:30+00'),
  ('Ravi',  'r2@test.local', '9000000002', '10K', null,      'PAID',      500, 'test-2026',  '2026-10-30 06:30+00'),
  ('Meera', 'r3@test.local', '9000000003', '10K', null,      'PENDING',   500, 'test-2026',  '2026-10-31 03:30+00'),
  ('Kiran', 'r4@test.local', '9000000004', '10K', 'EARLY20', 'PAID',      400, 'test-2026',  '2026-10-31 04:00+00'),
  ('Dev',   'r5@test.local', '9000000005', '21K', 'EARLY20', 'PAID',      800, 'test-2026',  '2026-11-01 18:00+00'),
  ('Isha',  'r6@test.local', '9000000006', '21K', 'EARLY20', 'CANCELLED', 800, 'test-2026',  '2026-11-01 18:45+00'),
  ('Om',    'r7@test.local', '9000000007', '21K', 'CLUB10',  'PENDING',   900, 'test-2026',  '2026-11-02 02:30+00'),
  ('Tara',  'r8@test.local', '9000000008', '10K', null,      'PAID',      500, 'other-2026', '2026-10-30 04:30+00');

set session_replication_role = origin;

-- What get_reg_stats('test-2026') must return, exactly and in this order.
create table test.expected (breakdown jsonb, daily jsonb);
insert into test.expected values (
  '[
    {"coupon_code": null,      "category": "10K", "payment_status": "PAID",      "count": 2},
    {"coupon_code": null,      "category": "10K", "payment_status": "PENDING",   "count": 1},
    {"coupon_code": "CLUB10",  "category": "21K", "payment_status": "PENDING",   "count": 1},
    {"coupon_code": "EARLY20", "category": "10K", "payment_status": "PAID",      "count": 1},
    {"coupon_code": "EARLY20", "category": "21K", "payment_status": "CANCELLED", "count": 1},
    {"coupon_code": "EARLY20", "category": "21K", "payment_status": "PAID",      "count": 1}
  ]',
  '[
    {"day": "2026-10-30", "payment_status": "PAID",      "count": 2},
    {"day": "2026-10-31", "payment_status": "PAID",      "count": 1},
    {"day": "2026-10-31", "payment_status": "PENDING",   "count": 1},
    {"day": "2026-11-01", "payment_status": "PAID",      "count": 1},
    {"day": "2026-11-02", "payment_status": "CANCELLED", "count": 1},
    {"day": "2026-11-02", "payment_status": "PENDING",   "count": 1}
  ]'
);
grant usage on schema test to authenticated;
grant select on test.expected to authenticated;

do $$
begin
  -- So that "a viewer sees no rows" below means hidden, not empty.
  perform test.ok((select count(*) from public.registrations) = 8,       'fixtures: registrations seeded');
  perform test.ok((select count(*) from public.registration_groups) = 1, 'fixtures: a group seeded');
  perform test.ok((select count(*) from public.coupons) = 2,             'fixtures: coupons seeded');

  perform test.ok(not has_function_privilege('anon', 'public.get_reg_stats(text)', 'execute'),
                  'grants: anon cannot execute get_reg_stats');
  perform test.ok(not has_function_privilege('anon', 'public.can_view_stats()', 'execute'),
                  'grants: anon cannot execute can_view_stats');
  perform test.ok(has_function_privilege('authenticated', 'public.get_reg_stats(text)', 'execute'),
                  'grants: signed-in users can call get_reg_stats (it checks access itself)');
end $$;

-- ── Anonymous visitor ───────────────────────────────────────────────────────
begin;
set local role anon;
do $$
begin
  perform test.act_as(null);
  begin
    perform public.get_reg_stats('test-2026');
    raise exception 'FAIL - anon was able to call get_reg_stats';
  exception when insufficient_privilege then
    perform test.ok(true, 'anon: get_reg_stats errors');
  end;
end $$;
rollback;

-- ── Signed in, but neither admin nor viewer ─────────────────────────────────
begin;
set local role authenticated;
do $$
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000d');
  perform test.ok(public.can_view_stats() = false, 'signed-in non-staff: can_view_stats() is false');
  begin
    perform public.get_reg_stats('test-2026');
    raise exception 'FAIL - a signed-in non-staff user got stats';
  exception when insufficient_privilege then
    perform test.ok(true, 'signed-in non-staff: get_reg_stats errors');
  end;
end $$;
rollback;

-- ── Deactivated viewer ──────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000c');
  perform test.ok(public.can_view_stats() = false, 'inactive viewer: can_view_stats() is false');
  begin
    perform public.get_reg_stats('test-2026');
    raise exception 'FAIL - an inactive viewer got stats';
  exception when insufficient_privilege then
    perform test.ok(true, 'inactive viewer: get_reg_stats errors');
  end;
  begin
    update public.stats_viewers set active = true where user_id = auth.uid();
    raise exception 'FAIL - an inactive viewer could reach stats_viewers';
  exception when insufficient_privilege then
    perform test.ok(true, 'inactive viewer: cannot reactivate themselves');
  end;
end $$;
rollback;

-- ── Active viewer ───────────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
declare
  s jsonb;
  n bigint;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000b');

  perform test.ok(public.can_view_stats(), 'viewer: can_view_stats() is true');
  perform test.ok(public.is_admin() = false, 'viewer: is_admin() is false');

  s := public.get_reg_stats('test-2026');
  perform test.ok(
    (select array_agg(k order by k) from jsonb_object_keys(s) k)
      = array['breakdown', 'daily', 'event_id', 'generated_at'],
    'viewer: result holds only event_id, generated_at, breakdown and daily');
  perform test.ok(s -> 'breakdown' = (select breakdown from test.expected),
    'viewer: totals by code x category x payment status are exact (other events excluded)');
  perform test.ok(s -> 'daily' = (select daily from test.expected),
    'viewer: per-day counts are exact and use Indian dates');
  perform test.ok(s::text !~ '@|9000000|"price"|"revenue"|Asha',
    'viewer: no names, emails, phones or money in the result');
  perform test.ok(public.get_reg_stats('no-such-event') -> 'breakdown' = '[]'::jsonb,
    'viewer: an event with no entries gives empty lists, not an error');

  select count(*) into n from public.registrations;
  perform test.ok(n = 0, 'viewer: select on registrations returns []');
  select count(*) into n from public.registration_groups;
  perform test.ok(n = 0, 'viewer: select on registration_groups returns []');
  select count(*) into n from public.coupons;
  perform test.ok(n = 0, 'viewer: select on coupons returns []');
  select count(*) into n from public.admin_users;
  perform test.ok(n = 0, 'viewer: select on admin_users returns []');

  update public.registrations set payment_status = 'PAID' where payment_status = 'PENDING';
  get diagnostics n = row_count;
  perform test.ok(n = 0, 'viewer: cannot change registrations (0 rows updated)');

  begin
    perform count(*) from public.stats_viewers;
    raise exception 'FAIL - a viewer could read stats_viewers';
  exception when insufficient_privilege then
    perform test.ok(true, 'viewer: cannot read the viewer list');
  end;
end $$;
rollback;

-- ── Admin: unchanged ────────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
declare
  s jsonb;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000a');
  perform test.ok(public.is_admin(), 'admin: is_admin() is still true');
  perform test.ok(public.can_view_stats(), 'admin: can_view_stats() is true');
  s := public.get_reg_stats('test-2026');
  perform test.ok(s -> 'breakdown' = (select breakdown from test.expected),
    'admin: gets the same totals');
  perform test.ok((select count(*) from public.registrations) = 8,
    'admin: still reads every registration (existing policies untouched)');
end $$;
rollback;

-- ── Removing the login removes the access ───────────────────────────────────
begin;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
do $$
begin
  perform test.ok(not exists (select 1 from public.stats_viewers
                               where user_id = '00000000-0000-0000-0000-00000000000b'),
    'deleting the Supabase user deletes their stats_viewers row');
end $$;
rollback;

\ir cleanup.sql
