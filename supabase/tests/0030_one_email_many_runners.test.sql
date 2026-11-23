-- Tests for 0030_one_email_many_runners.sql: one email may cover several
-- runners; the same runner (email + name) still cannot enter twice. Same
-- pattern as 0026: fixtures as the owner, then each block acts as one caller
-- and rolls back.

\set ON_ERROR_STOP 1

\ir helpers.sql

set session_replication_role = replica;

insert into public.events (id, name) values ('share-2026', 'Shared Email Run');

insert into public.event_categories (event_id, name, price, bib_start, bib_end) values
  ('share-2026', '10K', 1000, 10001, 10999),
  ('share-2026', '5K',   500,  5001,  5999);

-- An entry already made under the family address.
insert into public.registrations (first_name, last_name, email, phone, category, payment_status, event_id) values
  ('Asha', 'Patil', 'family@patil.in', '9800000001', '10K', 'PAID', 'share-2026');

set session_replication_role = origin;

-- A solo payload for the shared address.
create function test.solo(p_first text, p_last text, p_email text default 'family@patil.in')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'event_id', 'share-2026', 'category', '10K',
    'first_name', p_first, 'last_name', p_last, 'email', p_email,
    'phone', '9800000001', 'dob', '1990-01-01', 'waivers_accepted', true);
$$;

-- A group participant.
create function test.member(p_first text, p_last text, p_email text default 'family@patil.in')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'first_name', p_first, 'last_name', p_last, 'email', p_email,
    'phone', '9800000001', 'dob', '2012-05-05', 'gender', 'Female', 'category', '5K');
$$;

create function test.group_of(p_members jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'event_id', 'share-2026', 'waivers_accepted', true,
    'captain', jsonb_build_object('first_name', 'Sunil', 'last_name', 'Patil',
                                  'email', 'family@patil.in', 'phone', '9800000001'),
    'participants', p_members);
$$;

grant execute on all functions in schema test to anon, authenticated;

-- ── The name as compared ────────────────────────────────────────────────────
do $$
begin
  perform test.ok(public.runner_name_key('  Asha ', 'PATIL') = 'asha patil',
    'runner_name_key: trimmed and lower-cased');
  perform test.ok(public.runner_name_key('Asha  Patil', null) = public.runner_name_key('asha', 'patil'),
    'runner_name_key: the same name split differently across first/last is the same runner');
  perform test.ok(public.runner_name_key(null, null) = '', 'runner_name_key: no name -> empty');
  perform test.ok(
    (select count(*) from pg_indexes where indexname = 'registrations_event_runner_live_key') = 1
    and (select count(*) from pg_indexes where indexname = 'registrations_event_email_live_key') = 0,
    'index: email-only live index replaced by email + name');
end $$;

-- ── Solo entries (anon, the real entry point) ──────────────────────────────
begin;
set local role anon;
do $$
declare
  r    jsonb;
  code text;
begin
  perform test.act_as(null);

  r := public.create_registration(test.solo('Ravi', 'Patil'));
  perform test.ok(r->>'email' = 'family@patil.in' and r->>'first_name' = 'Ravi',
    'solo: a second runner can enter with an email already used by another runner');

  begin
    perform public.create_registration(test.solo(' ASHA', 'patil ', 'Family@Patil.in'));
    code := 'none';
  exception when unique_violation then
    code := sqlerrm;
  end;
  perform test.ok(code = 'ALREADY_REGISTERED',
    'solo: the same runner (email + name, any case or spacing) is refused as ALREADY_REGISTERED');

  begin
    perform public.create_registration(test.solo('  ', 'Patil'));
    code := 'none';
  exception when raise_exception then
    code := sqlerrm;
  end;
  perform test.ok(code = 'NAME_REQUIRED', 'solo: a first name is required (NAME_REQUIRED)');

  perform test.ok(public.is_runner_registered('FAMILY@patil.in', 'asha', 'PATIL', 'share-2026'),
    'is_runner_registered: yes for a runner holding a place (case-insensitive)');
  perform test.ok(not public.is_runner_registered('family@patil.in', 'Meera', 'Patil', 'share-2026'),
    'is_runner_registered: no for another name on the same email');
  perform test.ok(not public.is_runner_registered('other@patil.in', 'Asha', 'Patil', 'share-2026'),
    'is_runner_registered: no for the same name on another email');
end $$;
rollback;

-- A cancelled entry no longer holds the runner.
begin;
update public.registrations set payment_status = 'CANCELLED'
 where event_id = 'share-2026' and first_name = 'Asha';
set local role anon;
do $$
declare
  r jsonb;
begin
  perform test.act_as(null);
  perform test.ok(not public.is_runner_registered('family@patil.in', 'Asha', 'Patil', 'share-2026'),
    'is_runner_registered: a cancelled entry does not count');
  r := public.create_registration(test.solo('Asha', 'Patil'));
  perform test.ok(r->>'id' is not null, 'solo: a runner whose entry was cancelled can enter again');
end $$;
rollback;

-- The index itself, below the functions.
begin;
do $$
declare
  refused boolean := false;
begin
  insert into public.registrations (first_name, last_name, email, category, payment_status, event_id)
  values ('Meera', 'Patil', 'family@patil.in', '10K', 'PENDING', 'share-2026');
  perform test.ok(true, 'index: another name on the same email is allowed');

  begin
    insert into public.registrations (first_name, last_name, email, category, payment_status, event_id)
    values ('asha', 'PATIL', 'FAMILY@PATIL.IN', '10K', 'PENDING', 'share-2026');
  exception when unique_violation then
    refused := true;
  end;
  perform test.ok(refused, 'index: the same email + name twice is refused even by a direct insert');
end $$;
rollback;

-- ── Group entries ──────────────────────────────────────────────────────────
begin;
set local role anon;
do $$
declare
  r      jsonb;
  code   text;
  detail jsonb;
begin
  perform test.act_as(null);

  r := public.create_group_registration(test.group_of(jsonb_build_array(
    test.member('Meera', 'Patil'), test.member('Kabir', 'Patil'))));
  perform test.ok((r->>'participant_count')::integer = 2,
    'group: two children on the parent''s email, alongside the parent''s own entry');

  begin
    perform public.create_group_registration(test.group_of(jsonb_build_array(
      test.member('Tara', 'Patil'), test.member('tara', ' patil'))));
    code := 'none';
  exception when raise_exception then
    get stacked diagnostics code = message_text, detail = pg_exception_detail;
  end;
  perform test.ok(code = 'DUPLICATE_EMAIL_IN_GROUP' and (detail->>'index')::integer = 1,
    'group: the same runner twice in one group is refused, pointing at the second row');

  begin
    perform public.create_group_registration(test.group_of(jsonb_build_array(
      test.member('Isha', 'Patil'), test.member('Asha', 'Patil'))));
    code := 'none';
  exception when raise_exception then
    get stacked diagnostics code = message_text, detail = pg_exception_detail;
  end;
  perform test.ok(code = 'ALREADY_REGISTERED' and detail->>'name' = 'Asha Patil',
    'group: a runner who already entered solo (email + name) is refused, by name');
end $$;
rollback;

-- ── Admin -> Activity: one runner's entry does not hide another ────────────
do $$
begin
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'share-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
    'email', 'family@patil.in', 'first_name', 'Asha', 'last_name', 'Patil'));
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'share-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
    'email', 'family@patil.in', 'first_name', 'Meera', 'last_name', 'Patil'));
end $$;

begin;
set local role authenticated;
do $$
declare
  res  jsonb;
  rows jsonb;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000a');
  res := public.admin_registration_log('share-2026');
  select jsonb_object_agg(r->>'first_name', r) into rows from jsonb_array_elements(res->'rows') r;

  perform test.ok((rows->'Asha'->>'has_live_entry')::boolean,
    'activity: the runner who got in counts as having an entry');
  perform test.ok(not (rows->'Meera'->>'has_live_entry')::boolean,
    'activity: another runner on the same email is still "no entry yet"');

  res := public.admin_registration_log('share-2026', p_stuck_only => true);
  perform test.ok((res->>'total')::integer = 1 and res->'rows'->0->>'first_name' = 'Meera'
                  and (res->'summary'->>'stuck')::integer = 1,
    'activity: needs follow-up lists the stuck runner, not the one who got in');
end $$;
rollback;

drop function test.solo(text, text, text);
drop function test.member(text, text, text);
drop function test.group_of(jsonb);

\ir cleanup.sql
