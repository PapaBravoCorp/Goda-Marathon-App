-- Tests for 0027_runner_list_with_phone.sql (list_runners).

\set ON_ERROR_STOP 1

\ir helpers.sql

set session_replication_role = replica;

insert into public.events (id, name) values ('runners-2026', 'Runner List Run');

insert into public.registrations
  (first_name, last_name, email, phone, dob, blood_group, emergency_contact_name, emergency_contact_number,
   has_medical_condition, allergies, category, payment_status, cancelled_reason, price, bib, payment_ref, event_id, created_at)
values
  -- First attempt lapsed; paid on the second, in another category.
  ('Suvarna', 'Patil', 'suvarna@x.in', '7588010675', '1980-01-01', 'AB-', 'Emergency Person', '9111111111',
   true, 'peanuts', '10K', 'CANCELLED', 'PAYMENT_TIMEOUT', 1066, null, null, 'runners-2026', '2026-11-03 05:49+00'),
  ('Suvarna', 'Patil', 'suvarna@x.in', '+91 75880 10675', '1980-01-01', 'AB-', 'Emergency Person', '9111111111',
   true, 'peanuts', '5K', 'PAID', null, 656, '5005', 'pay_A', 'runners-2026', '2026-11-06 13:46+00'),
  -- Paid under a different email, same phone.
  ('Sunny', 'Sudhakar', 'first@x.in', '9890400878', '1990-01-01', 'O+', 'Emergency Person', '9111111111',
   false, null, '10K', 'CANCELLED', 'RUNNER_CANCELLED', 1299, null, null, 'runners-2026', '2026-10-24 10:47+00'),
  ('Sunny', 'Sudhakar', 'second@x.in', '9890400878', '1990-01-01', 'O+', 'Emergency Person', '9111111111',
   false, null, '10K', 'PAID', null, 1066, '10004', 'pay_B', 'runners-2026', '2026-10-24 11:53+00'),
  -- Never paid.
  ('Mahesh', 'Patil', 'mahesh@x.in', '9921675715', '1985-01-01', 'B+', 'Emergency Person', '9111111111',
   false, null, '10K', 'CANCELLED', 'PAYMENT_TIMEOUT', 1299, null, null, 'runners-2026', '2026-11-07 03:07+00');

set session_replication_role = origin;

-- ── Stats viewer ────────────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
declare
  rows   jsonb;
  keys   text[];
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000b');
  select jsonb_agg(to_jsonb(x)) into rows from public.list_runners('runners-2026') x;

  perform test.ok(jsonb_array_length(rows) = 5, 'viewer: one row per entry, every status');

  perform test.ok(exists (select 1 from jsonb_array_elements(rows) r where r->>'phone' = '7588010675'),
    'viewer: full phone number');
  perform test.ok(not exists (select 1 from jsonb_array_elements(rows) r where r->>'email_masked' like '%suvarna%'),
    'viewer: email still masked');

  select array_agg(k order by k) into keys from jsonb_object_keys(rows->0) k;
  perform test.ok(not (keys && array['dob', 'blood_group', 'emergency_contact_name', 'emergency_contact_number',
                                     'has_medical_condition', 'allergies', 'email']),
    'viewer: no DOB, blood group, emergency contact, medical details or full email');

  perform test.ok((select r->>'paid_entry' from jsonb_array_elements(rows) r
                    where r->>'payment_status' = 'CANCELLED' and r->>'name' = 'Suvarna Patil') = '5K · bib 5005',
    'paid_entry: a lapsed attempt names the paid entry (phone written differently)');
  perform test.ok((select r->>'paid_entry' from jsonb_array_elements(rows) r
                    where r->>'payment_status' = 'CANCELLED' and r->>'name' = 'Sunny Sudhakar') = '10K · bib 10004',
    'paid_entry: matched by phone when the email differs');
  perform test.ok((select r->>'paid_entry' from jsonb_array_elements(rows) r where r->>'name' = 'Mahesh Patil') is null,
    'paid_entry: empty for someone who never paid');
  perform test.ok(not exists (select 1 from jsonb_array_elements(rows) r
                               where r->>'payment_status' = 'PAID' and r->>'paid_entry' is not null),
    'paid_entry: empty on paid rows');
end $$;
rollback;

-- ── Nobody else ─────────────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
declare
  denied boolean := false;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000c');   -- former viewer
  begin
    perform count(*) from public.list_runners('runners-2026');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'former viewer: refused');

  perform test.act_as('00000000-0000-0000-0000-00000000000d');   -- stranger
  denied := false;
  begin
    perform count(*) from public.list_runners('runners-2026');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'stranger: refused');
end $$;
rollback;

begin;
set local role anon;
do $$
declare
  denied boolean := false;
begin
  perform test.act_as(null);
  begin
    perform count(*) from public.list_runners('runners-2026');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'anon: cannot call list_runners');
end $$;
rollback;

begin;
set local role authenticated;
do $$
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000a');
  perform test.ok((select count(*) from public.list_runners('runners-2026')) = 5, 'admin: allowed too');
end $$;
rollback;

\ir cleanup.sql
