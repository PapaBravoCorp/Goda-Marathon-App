-- Tests for 0026_coupon_schedule_and_offer_mode.sql: a coupon's scheduled
-- change, India-date validity, and the site-code auto-apply setting. Run by
-- run-db-tests.sh after every migration. Same pattern as 0022/0023: fixtures
-- as the owner, then each block acts as one caller and rolls back.
--
-- The cluster runs in UTC. Dates below are written relative to today's India
-- date (the same expression the migration uses), so the checks hold whatever
-- time of day they run.

\set ON_ERROR_STOP 1

\ir helpers.sql

create table test.d (today date);
insert into test.d values ((now() at time zone 'Asia/Kolkata')::date);
grant select on test.d to anon, authenticated;

set session_replication_role = replica;

insert into public.events (id, name) values ('sched-2026', 'Schedule Test Run');

insert into public.event_categories (event_id, name, price, bib_start, bib_end) values
  ('sched-2026', '10K', 1000, 10001, 10999),
  ('sched-2026', '21K', 2000, 21001, 21999);

-- GODA:   20% now, 10% from tomorrow             (change still ahead)
-- SWITCH: 20% until yesterday, 10% from today    (change already happened)
-- CAPPED: 20% capped at 150, 30% from yesterday  (cap still applies after the change)
-- FLATX:  Rs 300 off, Rs 100 off from tomorrow   (flat values are not capped at 100)
-- LASTDAY: valid until today                     (India date: still valid all day)
-- GONE:   valid until yesterday
-- SOON:   valid from tomorrow
insert into public.coupons
  (event_id, code, discount_type, discount_value, max_discount, next_discount_value, next_discount_from, valid_from, valid_until)
select 'sched-2026', x.code, x.kind, x.value, x.cap, x.next_value, d.today + x.next_offset, d.today + x.from_offset, d.today + x.until_offset
  from test.d d,
       (values
         ('GODA',    'PERCENT', 20,  null::numeric, 10,            1,           null::int, null::int),
         ('SWITCH',  'PERCENT', 20,  null,          10,            0,           null,      null),
         ('CAPPED',  'PERCENT', 20,  150,           30,            -1,          null,      null),
         ('FLATX',   'FLAT',    300, null,          100,           1,           null,      null),
         ('LASTDAY', 'PERCENT', 15,  null,          null::numeric, null::int,   null,      0),
         ('GONE',    'PERCENT', 15,  null,          null,          null,        null,      -1),
         ('SOON',    'PERCENT', 15,  null,          null,          null,        1,         null)
       ) as x(code, kind, value, cap, next_value, next_offset, from_offset, until_offset);

set session_replication_role = origin;

-- ── Schema (as the owner) ───────────────────────────────────────────────────
do $$
begin
  perform test.ok((select featured_coupon_auto_apply from public.events where id = 'sched-2026') is true,
    'events: featured_coupon_auto_apply defaults to true (auto-apply, as before 0026)');

  begin
    insert into public.coupons (event_id, code, discount_value, next_discount_value)
    values ('sched-2026', 'HALF1', 10, 5);
    perform test.ok(false, 'constraint: a scheduled value without a date is refused');
  exception when check_violation then
    perform test.ok(true, 'constraint: a scheduled value without a date is refused');
  end;

  begin
    insert into public.coupons (event_id, code, discount_value, next_discount_from)
    values ('sched-2026', 'HALF2', 10, current_date);
    perform test.ok(false, 'constraint: a scheduled date without a value is refused');
  exception when check_violation then
    perform test.ok(true, 'constraint: a scheduled date without a value is refused');
  end;

  begin
    insert into public.coupons (event_id, code, discount_type, discount_value, next_discount_value, next_discount_from)
    values ('sched-2026', 'OVER100', 'PERCENT', 10, 120, current_date);
    perform test.ok(false, 'constraint: a scheduled percentage over 100 is refused');
  exception when check_violation then
    perform test.ok(true, 'constraint: a scheduled percentage over 100 is refused');
  end;

  begin
    insert into public.coupons (event_id, code, discount_value, next_discount_value, next_discount_from)
    values ('sched-2026', 'ZERO', 10, 0, current_date);
    perform test.ok(false, 'constraint: a scheduled value of zero is refused');
  exception when check_violation then
    perform test.ok(true, 'constraint: a scheduled value of zero is refused');
  end;
end $$;

-- ── Public quotes (anon, through preview_coupon) ────────────────────────────
begin;
set local role anon;
do $$
declare
  q jsonb;
  today date := (select d.today from test.d d);
begin
  perform test.act_as(null);

  perform test.ok(not has_function_privilege('anon', 'public.evaluate_coupon(text, text[], text, boolean)', 'execute'),
    'grants: anon still cannot call evaluate_coupon directly');

  q := public.preview_coupon('GODA', 'sched-2026', array['10K'], false);
  perform test.ok((q->>'valid')::boolean and (q->>'discount')::numeric = 200 and (q->>'discount_value')::numeric = 20,
    'before the change: GODA takes 20% (200 of 1000)');
  perform test.ok((q->>'next_discount_value')::numeric = 10 and (q->>'next_discount_from')::date = today + 1,
    'before the change: the quote says 10% from tomorrow, so the site can show the deadline');

  q := public.preview_coupon('goda', 'sched-2026', array['10K', '21K'], true);
  perform test.ok((q->>'discount')::numeric = 600,
    'before the change: a group basket (1000 + 2000) gets 20% too, code matched case-insensitively');

  q := public.preview_coupon('SWITCH', 'sched-2026', array['10K'], false);
  perform test.ok((q->>'discount')::numeric = 100 and (q->>'discount_value')::numeric = 10,
    'on the day of the change: the new value (10%) applies from 00:00 India time');
  perform test.ok(q->'next_discount_value' = 'null'::jsonb and q->'next_discount_from' = 'null'::jsonb,
    'after the change: no upcoming change is reported');

  q := public.preview_coupon('CAPPED', 'sched-2026', array['21K'], false);
  perform test.ok((q->>'discount')::numeric = 150 and (q->>'discount_value')::numeric = 30,
    'after the change: the cap (150) still limits the new 30% (600)');

  q := public.preview_coupon('FLATX', 'sched-2026', array['10K'], false);
  perform test.ok((q->>'discount')::numeric = 300 and (q->>'next_discount_value')::numeric = 100,
    'flat code: Rs 300 off now, Rs 100 scheduled (flat values are not limited to 100)');

  q := public.preview_coupon('LASTDAY', 'sched-2026', array['10K'], false);
  perform test.ok((q->>'valid')::boolean and (q->>'valid_until')::date = today,
    'valid until today (India date): still valid, and the end date is in the quote');

  q := public.preview_coupon('GONE', 'sched-2026', array['10K'], false);
  perform test.ok(q->>'reason' = 'COUPON_EXPIRED', 'valid until yesterday (India date): expired');

  q := public.preview_coupon('SOON', 'sched-2026', array['10K'], false);
  perform test.ok(q->>'reason' = 'COUPON_NOT_STARTED', 'valid from tomorrow (India date): not started');
end $$;
rollback;

-- ── The stored entry uses the value in force (anon, the real entry point) ──
begin;
set local role anon;
do $$
declare
  r jsonb;
begin
  perform test.act_as(null);

  r := public.create_registration(jsonb_build_object(
    'event_id', 'sched-2026', 'category', '10K',
    'first_name', 'Asha', 'email', 'asha.sched@example.com', 'dob', '1990-01-01',
    'waivers_accepted', true, 'coupon_code', 'SWITCH'));
  perform test.ok((r->>'list_price')::numeric = 1000 and (r->>'discount')::numeric = 100 and (r->>'price')::numeric = 900,
    'create_registration: SWITCH stores the scheduled 10% (900 payable), the same figure the quote showed');

  r := public.create_registration(jsonb_build_object(
    'event_id', 'sched-2026', 'category', '10K',
    'first_name', 'Ravi', 'email', 'ravi.sched@example.com', 'dob', '1990-01-01',
    'waivers_accepted', true, 'coupon_code', 'GODA'));
  perform test.ok((r->>'discount')::numeric = 200 and r->>'coupon_code' = 'GODA',
    'create_registration: GODA stores 20% while the change is still ahead');
end $$;
rollback;

-- ── Admin: the settings are editable, entries are not re-priced ────────────
begin;
set local role authenticated;
do $$
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000a');

  update public.events set featured_coupon_auto_apply = false where id = 'sched-2026';
  perform test.ok((select featured_coupon_auto_apply from public.events where id = 'sched-2026') is false,
    'admin: can switch the site code to show-only');

  update public.coupons set next_discount_value = 5, next_discount_from = current_date + 3
   where event_id = 'sched-2026' and code = 'GODA';
  perform test.ok((select next_discount_value from public.coupons where event_id = 'sched-2026' and code = 'GODA') = 5,
    'admin: can reschedule a change');

  update public.coupons set next_discount_value = null, next_discount_from = null
   where event_id = 'sched-2026' and code = 'GODA';
  perform test.ok((select next_discount_from from public.coupons where event_id = 'sched-2026' and code = 'GODA') is null,
    'admin: can clear a scheduled change');
end $$;
rollback;

begin;
set local role anon;
do $$
begin
  perform test.act_as(null);
  begin
    update public.events set featured_coupon_auto_apply = false where id = 'sched-2026';
  exception when insufficient_privilege then
    null;
  end;
end $$;
rollback;

do $$
begin
  perform test.ok((select featured_coupon_auto_apply from public.events where id = 'sched-2026') is true,
    'anon: cannot change featured_coupon_auto_apply');
end $$;

drop table test.d;

\ir cleanup.sql
