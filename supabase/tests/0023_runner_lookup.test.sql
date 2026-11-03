-- Tests for 0023_runner_lookup.sql (list_registrations_basic and the masking).
-- Run by run-db-tests.sh after every migration has been applied. Same pattern
-- as 0022's tests: each block acts as one caller, then rolls back.

\set ON_ERROR_STOP 1

\ir helpers.sql

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Every sensitive field is filled with a recognisable value, so the checks
-- below can prove none of it comes back.
set session_replication_role = replica;

insert into public.events (id, name) values
  ('lookup-2026', 'Lookup Test Run'),
  ('elsewhere-2026', 'Another Event');

-- Today's prices. The 15K (was 600) and 21K (was 1200) went up after most of
-- these runners entered, so a paid amount that follows the category price is
-- wrong and the amount checks below catch it.
insert into public.event_categories (event_id, name, price, bib_start, bib_end) values
  ('lookup-2026', '5K',   499,  5001,  5999),
  ('lookup-2026', '10K',  799, 10001, 10999),
  ('lookup-2026', '15K',  700, 15001, 15999),
  ('lookup-2026', '21K', 1499, 21001, 21999);

-- Real coupons, so "viewer: select on coupons returns []" has rows to hide.
insert into public.coupons (event_id, code, discount_type, discount_value, scope) values
  ('lookup-2026', 'EARLYBIRD', 'PERCENT', 18,  'ANY'),
  ('lookup-2026', 'CLUB10',    'FLAT',    200, 'GROUP_ONLY');

-- GRP-NRC: Kiran (21K, 1200) + Sunil (10K, 799) = 1999, CLUB10 takes 200 off,
-- split 120 / 80 by price, so the group was charged 1799 in one payment.
insert into public.registration_groups
  (id, group_code, event_id, captain_first_name, captain_email, organisation_name,
   subtotal, discount, total, coupon_code, payment_status, payment_ref)
values
  ('00000000-0000-0000-0000-0000000000c1', 'GRP-NRC',  'lookup-2026', 'Captain', 'captain@club.in', 'Nashik Runners Club',
   1999, 200, 1799, 'CLUB10', 'PAID', 'pay_GRP777'),
  ('00000000-0000-0000-0000-0000000000c2', 'GRP-0042', 'lookup-2026', 'Captain', 'captain@two.in',  null,
   499, 0, 499, null, 'REFUNDED', 'pay_REF999');

insert into public.registrations
  (first_name, last_name, email, phone, dob, blood_group, emergency_contact_name, emergency_contact_number,
   has_medical_condition, allergies, category, tshirt_size, city, coupon_code, payment_status,
   list_price, discount_amount, price, payment_ref, bib, group_id, event_id, created_at)
values
  ('Asha', 'Kulkarni', 'asha.k@example.com', '+91 98765 43210', '1990-01-02', 'AB-', 'Emergency Person', '9111111111',
   true, 'peanuts', '10K', 'M', 'Nashik', null, 'PAID',
   799, 0, 799, 'pay_ABC123', '10001', null, 'lookup-2026', '2026-11-01 05:00+00'),
  ('Ravi', null, 'ab@x.org', '9000000002', '1985-05-05', 'O+', 'Emergency Person', '9111111111',
   false, null, '21K', 'L', 'Pune', 'EARLYBIRD', 'PENDING',
   1499, 269, 1230, null, '21001', null, 'lookup-2026', '2026-11-01 06:00+00'),
  ('Meera', 'Joshi', 'z@y.in', '12', '1992-02-02', 'B+', 'Emergency Person', '9111111111',
   false, null, '10K', 'S', 'Mumbai', null, 'CANCELLED',
   799, 0, 799, null, null, null, 'lookup-2026', '2026-11-01 07:00+00'),
  ('Kiran', 'Patil', 'kiran@club.in', '9876501234', '1988-08-08', 'A-', 'Emergency Person', '9111111111',
   true, 'peanuts', '21K', 'XL', 'Nashik', 'CLUB10', 'PAID',
   1200, 120, 1080, 'pay_GRP777', '21002', '00000000-0000-0000-0000-0000000000c1', 'lookup-2026', '2026-11-01 08:00+00'),
  ('Sunil', 'Pawar', 'sunil.p@club.in', '98220 12345', '1979-07-07', 'B-', 'Emergency Person', '9111111111',
   false, null, '10K', 'L', 'Nashik', 'CLUB10', 'PAID',
   799, 80, 719, 'pay_GRP777', '10002', '00000000-0000-0000-0000-0000000000c1', 'lookup-2026', '2026-11-01 08:01+00'),
  ('Dev', null, 'no-at-sign', null, '2000-10-10', 'AB-', 'Emergency Person', '9111111111',
   false, null, '5K', null, null, null, 'REFUNDED',
   499, 0, 499, 'pay_REF999', null, '00000000-0000-0000-0000-0000000000c2', 'lookup-2026', '2026-11-01 09:00+00'),
  -- EARLYBIRD (18% off) on the old 21K price, paid through Razorpay.
  ('Neha', 'Deshpande', 'neha.d@example.com', '+91 99220 11223', '1993-04-04', 'O-', 'Emergency Person', '9111111111',
   true, 'asthma', '21K', 'S', 'Nashik', 'EARLYBIRD', 'PAID',
   1200, 216, 984, 'pay_EARLY18', '21003', null, 'lookup-2026', '2026-11-01 10:00+00'),
  -- EARLYBIRD on the old 15K price, paid at the desk and marked paid by an
  -- admin, so there is no Razorpay payment.
  ('Pooja', 'Kale', 'pooja@kale.in', '9370012121', '1996-06-06', 'A+', 'Emergency Person', '9111111111',
   false, null, '15K', 'M', 'Pune', 'EARLYBIRD', 'PAID',
   600, 108, 492, null, '15001', null, 'lookup-2026', '2026-11-01 11:00+00'),
  ('Tara', 'Elsewhere', 'tara@else.where', '9999999999', '1995-03-03', 'O-', 'Emergency Person', '9111111111',
   false, null, '10K', 'M', 'Pune', null, 'PAID',
   799, 0, 799, 'pay_OTHER1', '10099', null, 'elsewhere-2026', '2026-11-01 05:30+00');

-- The payment records, as the razorpay-* edge functions leave them. A solo
-- payment points at its entry; a group's points at the group.
insert into public.payments
  (event_id, registration_id, group_id, razorpay_order_id, razorpay_payment_id,
   amount_paise, refunded_paise, status, paid_at)
select 'lookup-2026', r.id, null, 'order_' || r.payment_ref, r.payment_ref,
       (r.price * 100)::integer, 0, 'PAID', r.created_at
  from public.registrations r
 where r.payment_ref in ('pay_ABC123', 'pay_EARLY18');

insert into public.payments
  (event_id, registration_id, group_id, razorpay_order_id, razorpay_payment_id,
   amount_paise, refunded_paise, status, paid_at)
values
  ('lookup-2026', null, '00000000-0000-0000-0000-0000000000c1', 'order_GRP777', 'pay_GRP777',
   179900, 0, 'PAID', '2026-11-01 08:05+00'),
  ('lookup-2026', null, '00000000-0000-0000-0000-0000000000c2', 'order_REF999', 'pay_REF999',
   49900, 49900, 'REFUNDED', '2026-11-01 09:05+00');

set session_replication_role = origin;

-- Exactly what the viewer must get back for lookup-2026, newest first
-- (registered_at is checked separately).
create table test.expected_runners (rows jsonb);
insert into test.expected_runners values ('[
  {"name": "Pooja Kale", "category": "15K", "entry_type": "Individual", "group_name": null,
   "payment_status": "PAID", "amount_paid": 492, "coupon_code": "EARLYBIRD", "razorpay_payment_id": null,
   "bib": "15001", "tshirt_size": "M", "city": "Pune", "phone_masked": "******2121", "email_masked": "po***@kale.in"},
  {"name": "Neha Deshpande", "category": "21K", "entry_type": "Individual", "group_name": null,
   "payment_status": "PAID", "amount_paid": 984, "coupon_code": "EARLYBIRD", "razorpay_payment_id": "pay_EARLY18",
   "bib": "21003", "tshirt_size": "S", "city": "Nashik", "phone_masked": "******1223", "email_masked": "ne***@example.com"},
  {"name": "Dev", "category": "5K", "entry_type": "Group", "group_name": "GRP-0042",
   "payment_status": "REFUNDED", "amount_paid": null, "coupon_code": null, "razorpay_payment_id": "pay_REF999",
   "bib": null, "tshirt_size": null, "city": null, "phone_masked": null, "email_masked": "***"},
  {"name": "Sunil Pawar", "category": "10K", "entry_type": "Group", "group_name": "Nashik Runners Club",
   "payment_status": "PAID", "amount_paid": 719, "coupon_code": "CLUB10", "razorpay_payment_id": "pay_GRP777",
   "bib": "10002", "tshirt_size": "L", "city": "Nashik", "phone_masked": "******2345", "email_masked": "su***@club.in"},
  {"name": "Kiran Patil", "category": "21K", "entry_type": "Group", "group_name": "Nashik Runners Club",
   "payment_status": "PAID", "amount_paid": 1080, "coupon_code": "CLUB10", "razorpay_payment_id": "pay_GRP777",
   "bib": "21002", "tshirt_size": "XL", "city": "Nashik", "phone_masked": "******1234", "email_masked": "ki***@club.in"},
  {"name": "Meera Joshi", "category": "10K", "entry_type": "Individual", "group_name": null,
   "payment_status": "CANCELLED", "amount_paid": null, "coupon_code": null, "razorpay_payment_id": null,
   "bib": null, "tshirt_size": "S", "city": "Mumbai", "phone_masked": "******", "email_masked": "***@y.in"},
  {"name": "Ravi", "category": "21K", "entry_type": "Individual", "group_name": null,
   "payment_status": "PENDING", "amount_paid": null, "coupon_code": "EARLYBIRD", "razorpay_payment_id": null,
   "bib": "21001", "tshirt_size": "L", "city": "Pune", "phone_masked": "******0002", "email_masked": "a***@x.org"},
  {"name": "Asha Kulkarni", "category": "10K", "entry_type": "Individual", "group_name": null,
   "payment_status": "PAID", "amount_paid": 799, "coupon_code": null, "razorpay_payment_id": "pay_ABC123",
   "bib": "10001", "tshirt_size": "M", "city": "Nashik", "phone_masked": "******3210", "email_masked": "as***@example.com"}
]');
grant select on test.expected_runners to authenticated;

-- ── Masking rules (as the owner) ────────────────────────────────────────────
do $$
begin
  perform test.ok(public.mask_phone('+91 98765 43210') = '******3210', 'mask_phone: +91 and spaces ignored, last 4 kept');
  perform test.ok(public.mask_phone('9000000002') = '******0002',      'mask_phone: plain 10 digits');
  perform test.ok(public.mask_phone('12') = '******',                  'mask_phone: too short to be a number -> fully masked');
  perform test.ok(public.mask_phone(null) is null and public.mask_phone('') is null and public.mask_phone('n/a') is null,
                  'mask_phone: empty or no digits -> null');
  perform test.ok(public.mask_email('asha.k@example.com') = 'as***@example.com', 'mask_email: first 2 + domain');
  perform test.ok(public.mask_email('ab@x.org') = 'a***@x.org',  'mask_email: 2-letter name keeps one letter hidden');
  perform test.ok(public.mask_email('z@y.in') = '***@y.in',      'mask_email: 1-letter name fully hidden');
  perform test.ok(public.mask_email('no-at-sign') = '***',       'mask_email: no @ -> fully masked');
  perform test.ok(public.mask_email('  Ab.C@Ex.com ') = 'Ab***@Ex.com', 'mask_email: trims spaces');
  perform test.ok(public.mask_email(null) is null and public.mask_email(' ') is null, 'mask_email: empty -> null');

  perform test.ok(not has_function_privilege('anon', 'public.list_registrations_basic(text)', 'execute'),
                  'grants: anon cannot execute list_registrations_basic');
  perform test.ok(not has_function_privilege('authenticated', 'public.mask_phone(text)', 'execute')
              and not has_function_privilege('authenticated', 'public.mask_email(text)', 'execute'),
                  'grants: the masking helpers are not callable through the API');
end $$;

-- ── Anonymous visitor ───────────────────────────────────────────────────────
begin;
set local role anon;
do $$
begin
  perform test.act_as(null);
  begin
    perform * from public.list_registrations_basic('lookup-2026');
    raise exception 'FAIL - anon got the runner list';
  exception when insufficient_privilege then
    perform test.ok(true, 'anon: list_registrations_basic errors');
  end;
end $$;
rollback;

-- ── Signed in, but neither admin nor viewer ─────────────────────────────────
begin;
set local role authenticated;
do $$
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000d');
  begin
    perform * from public.list_registrations_basic('lookup-2026');
    raise exception 'FAIL - a signed-in non-staff user got the runner list';
  exception when insufficient_privilege then
    perform test.ok(true, 'signed-in non-staff: list_registrations_basic errors');
  end;
end $$;
rollback;

-- ── Deactivated viewer ──────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000c');
  begin
    perform * from public.list_registrations_basic('lookup-2026');
    raise exception 'FAIL - an inactive viewer got the runner list';
  exception when insufficient_privilege then
    perform test.ok(true, 'inactive viewer: list_registrations_basic errors');
  end;
end $$;
rollback;

-- ── Active viewer ───────────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
declare
  got jsonb;
  n   bigint;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000b');

  select jsonb_agg(to_jsonb(x) - 'registered_at' order by x.registered_at desc)
    into got from public.list_registrations_basic('lookup-2026') x;
  perform test.ok(got = (select rows from test.expected_runners),
    'viewer: every status, exact columns and values, newest first, other events excluded');

  perform test.ok(
    (select array_agg(k order by k) from jsonb_object_keys(
       (select to_jsonb(x) from public.list_registrations_basic('lookup-2026') x limit 1)) k)
    = array['amount_paid', 'bib', 'category', 'city', 'coupon_code', 'email_masked', 'entry_type',
            'group_name', 'name', 'payment_status', 'phone_masked', 'razorpay_payment_id',
            'registered_at', 'tshirt_size'],
    'viewer: only the agreed columns come back');

  perform test.ok(
    (select bool_and(x.registered_at = '2026-11-01 09:00+00' or x.name <> 'Dev')
       from public.list_registrations_basic('lookup-2026') x),
    'viewer: registered_at is the entry time');

  -- Kept for the owner-side comparison below (temp tables are per session).
  create temp table lookup_out on commit drop as
    select * from public.list_registrations_basic('lookup-2026');

  select count(*) into n from public.registrations;
  perform test.ok(n = 0, 'viewer: select on registrations still returns []');
  select count(*) into n from public.registration_groups;
  perform test.ok(n = 0, 'viewer: select on registration_groups still returns []');
  select count(*) into n from public.coupons;
  perform test.ok(n = 0, 'viewer: select on coupons still returns []');

  begin
    perform public.mask_phone('9000000002');
    raise exception 'FAIL - a viewer could call mask_phone directly';
  exception when insufficient_privilege then
    perform test.ok(true, 'viewer: cannot call the masking helpers directly');
  end;
end $$;

-- Back to the owner, still inside the transaction, to compare what the viewer
-- received with the real rows the viewer cannot read.
reset role;
do $$
declare
  leaked text;
begin
  perform test.ok((select count(*) from lookup_out) = 8, 'fixtures: the viewer received all 8 lookup-2026 entries');

  perform test.ok(
    (select bool_and(length(regexp_replace(coalesce(o.phone_masked, ''), '\D', '', 'g')) <= 4) from lookup_out o),
    'masking: no row shows more than 4 digits of a phone');

  select string_agg(r.email, ', ') into leaked
    from public.registrations r
    join lookup_out o on true
   where r.event_id = 'lookup-2026'
     and r.email is not null
     and (o.email_masked = r.email
          or (length(substring(r.email from '^(.*)@')) >= 2
              and position(substring(r.email from '^(.*)@') in coalesce(o.email_masked, '')) > 0));
  perform test.ok(leaked is null, 'masking: no row shows a full email or full email name' || coalesce(' (leaked: ' || leaked || ')', ''));

  select string_agg(v, ', ') into leaked
    from (
      select distinct unnest(array[
               r.email, r.phone, regexp_replace(r.phone, '\D', '', 'g'), r.dob::text,
               r.blood_group, r.emergency_contact_name, r.emergency_contact_number, r.allergies]) as v
        from public.registrations r
       where r.event_id = 'lookup-2026'
    ) sensitive
   where length(v) >= 3
     and (select string_agg(to_jsonb(o)::text, ' ') from lookup_out o) like '%' || v || '%';
  perform test.ok(leaked is null,
    'masking: no full phone, email, DOB, emergency contact, blood group or medical note anywhere in the response'
    || coalesce(' (found: ' || leaked || ')', ''));
end $$;
rollback;

-- ── Amount paid is what was charged ─────────────────────────────────────────
-- The 15K and 21K prices went up after these runners entered, and EARLYBIRD
-- took 18% off. None of that may move what a runner is shown to have paid.
begin;
set local role authenticated;
do $$
declare
  paid jsonb;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000b');
  select jsonb_object_agg(x.name, x.amount_paid) into paid
    from public.list_registrations_basic('lookup-2026') x;

  perform test.ok((paid->>'Neha Deshpande')::numeric = 984,
    'amount paid: EARLYBIRD entry paid through Razorpay shows the 984 charged -- not the new 21K price (1499), '
    || 'the old list price (1200) or 18% off the new price (1229.18)');
  perform test.ok((paid->>'Pooja Kale')::numeric = 492,
    'amount paid: EARLYBIRD entry marked paid by an admin shows its own price after the coupon (492), not the new 15K price (700)');
  perform test.ok((paid->>'Kiran Patil')::numeric = 1080 and (paid->>'Sunil Pawar')::numeric = 719,
    'amount paid: each group member shows their own share of the group payment, not the group total');
  perform test.ok(paid->'Ravi' = 'null'::jsonb and paid->'Meera Joshi' = 'null'::jsonb and paid->'Dev' = 'null'::jsonb,
    'amount paid: empty for PENDING, CANCELLED and REFUNDED');

  create temp table amounts_out on commit drop as
    select x.name, x.amount_paid, x.razorpay_payment_id from public.list_registrations_basic('lookup-2026') x;
end $$;

-- Owner side: the members' shares add up to what Razorpay took from the group.
reset role;
do $$
begin
  perform test.ok(
    (select sum(o.amount_paid) from amounts_out o where o.razorpay_payment_id = 'pay_GRP777')
    = (select p.amount_paise / 100.0 from public.payments p where p.razorpay_payment_id = 'pay_GRP777'),
    'amount paid: a group''s shares add up to its Razorpay payment (1799)');
end $$;
rollback;

-- The payment record wins over the entry row. If the row's price were edited
-- after payment, the list still shows what Razorpay took, less any partial
-- refund.
begin;
set local session_replication_role = replica;
update public.registrations set price = 1499 where payment_ref = 'pay_EARLY18';
update public.payments set refunded_paise = 20000 where razorpay_payment_id = 'pay_ABC123';
set local session_replication_role = origin;
set local role authenticated;
do $$
declare
  paid jsonb;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000b');
  select jsonb_object_agg(x.name, x.amount_paid) into paid
    from public.list_registrations_basic('lookup-2026') x;
  perform test.ok((paid->>'Neha Deshpande')::numeric = 984,
    'amount paid: read from the payment record -- an entry row edited to 1499 after payment still shows the 984 charged');
  perform test.ok((paid->>'Asha Kulkarni')::numeric = 599,
    'amount paid: a partial refund (200 of 799) is taken off');
end $$;
rollback;

-- ── Admin: also allowed ─────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000a');
  perform test.ok((select count(*) from public.list_registrations_basic('lookup-2026')) = 8,
    'admin: can use the runner list too');
end $$;
rollback;

\ir cleanup.sql
