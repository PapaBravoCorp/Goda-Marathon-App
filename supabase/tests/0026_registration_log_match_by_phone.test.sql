-- Tests for 0026_registration_log_match_by_phone.sql: a person who failed and
-- then got in under another email is matched by phone.

\set ON_ERROR_STOP 1

\ir helpers.sql

set session_replication_role = replica;

insert into public.events (id, name) values ('phone-2026', 'Phone Match Run');

insert into public.registrations (first_name, email, phone, category, payment_status, event_id) values
  ('Sunny', 'first@try.in',  '9890400878',      '10K', 'CANCELLED', 'phone-2026'),  -- refused address
  ('Sunny', 'second@try.in', '+91 98904 00878', '10K', 'PAID',      'phone-2026'),  -- got in with another
  ('Gone',  'gone@try.in',   '9000000001',      '10K', 'CANCELLED', 'phone-2026'),  -- never got in
  ('Short', 'short@try.in',  '12345',           '10K', 'PAID',      'phone-2026');  -- too short to match on

set session_replication_role = origin;

do $$
begin
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'phone-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
    'email', 'first@try.in', 'phone', '09890400878'));
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'phone-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
    'email', 'gone@try.in', 'phone', '9000000001'));
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'phone-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
    'email', 'other@try.in', 'phone', '12345'));
end $$;

do $$
begin
  perform test.ok(public._phone10('+91 98904 00878') = '9890400878', '_phone10: +91 and spaces');
  perform test.ok(public._phone10('09890400878') = '9890400878', '_phone10: leading 0');
  perform test.ok(public._phone10('12345') is null and public._phone10(null) is null, '_phone10: too short or empty -> null');
end $$;

begin;
set local role anon;
do $$
declare
  denied boolean := false;
begin
  perform test.act_as(null);
  begin
    perform public._live_entry_email('phone-2026', 'x@y.in', '9890400878');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'anon: cannot call _live_entry_email (it would reveal who registered)');
end $$;
rollback;

begin;
set local role authenticated;
do $$
declare
  res  jsonb;
  rows jsonb;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000a');
  res := public.admin_registration_log('phone-2026');
  select jsonb_object_agg(r->>'email', r) into rows from jsonb_array_elements(res->'rows') r;

  perform test.ok((rows->'first@try.in'->>'has_live_entry')::boolean,
    'phone match: got in under another email counts as having an entry');
  perform test.ok(rows->'first@try.in'->>'live_entry_email' = 'second@try.in',
    'phone match: says which address holds the entry');
  perform test.ok(not (rows->'gone@try.in'->>'has_live_entry')::boolean,
    'no match: still listed as no entry');
  perform test.ok(not (rows->'other@try.in'->>'has_live_entry')::boolean,
    'a phone too short to be one never matches');

  res := public.admin_registration_log('phone-2026', p_stuck_only => true);
  perform test.ok((res->>'total')::integer = 2 and (res->'summary'->>'stuck')::integer = 2,
    'needs follow-up: the person who got in by another email is no longer listed');
end $$;
rollback;

delete from public.registration_log where event_id = 'phone-2026';

\ir cleanup.sql
