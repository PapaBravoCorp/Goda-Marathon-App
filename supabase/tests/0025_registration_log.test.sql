-- Tests for 0025_registration_log.sql (log_registration_event and
-- admin_registration_log). Same pattern as 0022/0023: each block acts as one
-- caller, then rolls back.

\set ON_ERROR_STOP 1

\ir helpers.sql

-- ── Fixtures ────────────────────────────────────────────────────────────────
set session_replication_role = replica;

insert into public.events (id, name) values ('log-2026', 'Log Test Run');

insert into public.registration_groups
  (id, group_code, event_id, captain_first_name, captain_email, subtotal, discount, total, payment_status)
values
  ('00000000-0000-0000-0000-0000000000e1', 'GRP-LOG', 'log-2026', 'Cap', 'captain@log.in', 998, 0, 998, 'PAID');

insert into public.registrations (first_name, email, category, payment_status, event_id) values
  ('Live',  'live@log.in',  '10K', 'PENDING',   'log-2026'),   -- retried and got in
  ('Gone',  'stuck@log.in', '10K', 'CANCELLED', 'log-2026');   -- lapsed, never got back in

set session_replication_role = origin;

-- Two failures and a success, as the form sends them.
do $$
begin
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'log-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED', 'code', 'UNKNOWN',
    'email', 'Stuck@Log.in', 'first_name', 'Gone', 'error_sqlstate', '23505',
    'error_message', 'duplicate key value violates unique constraint "unique_email_per_event"',
    'client_id', 'phone-1'));
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'log-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED', 'code', 'UNKNOWN',
    'email', 'live@log.in', 'first_name', 'Live', 'client_id', 'phone-2'));
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'log-2026', 'flow', 'GROUP', 'stage', 'PAYMENT', 'status', 'FAILED', 'code', 'DECLINED',
    'email', 'captain@log.in', 'client_id', 'phone-3'));
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'log-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'OK', 'code', 'PENDING',
    'email', 'live@log.in', 'client_id', 'phone-2'));
end $$;

-- ── Anonymous runner: may write, may not read ───────────────────────────────
begin;
set local role anon;
do $$
declare
  denied boolean := false;
begin
  perform test.act_as(null);

  perform test.ok(public.log_registration_event(
    '{"event_id":"log-2026","flow":"SOLO","stage":"DETAILS","status":"FAILED","code":"EMAIL_TAKEN","email":"x@log.in"}'),
    'anon: can log an event');

  perform test.ok(public.log_registration_event(
    '{"event_id":"no-such-event","flow":"SOLO","stage":"SUBMIT","status":"FAILED"}') = false,
    'anon: an unknown event is refused');
  perform test.ok(public.log_registration_event(
    '{"event_id":"log-2026","flow":"SOLO","stage":"HACK","status":"FAILED"}') = false,
    'anon: an unknown stage is refused');
  perform test.ok(public.log_registration_event('"not an object"') = false,
    'anon: a non-object payload is refused, not raised');
  perform test.ok(public.log_registration_event(
    jsonb_build_object('event_id', 'log-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
                       'error_message', repeat('x', 30000))) = false,
    'anon: an oversized payload is refused');
  perform test.ok(public.log_registration_event(
    '{"event_id":"log-2026","flow":"SOLO","stage":"SUBMIT","status":"FAILED","client_at":"garbage","registration_id":"nope","amount":"lots"}'),
    'anon: unparseable optional fields are dropped, the row is kept');

  begin
    perform count(*) from public.registration_log;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'anon: cannot read the log table');

  denied := false;
  begin
    perform public.admin_registration_log('log-2026');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'anon: cannot call admin_registration_log');
end $$;
rollback;

-- ── Long fields are cut, not refused ────────────────────────────────────────
begin;
do $$
begin
  perform public.log_registration_event(jsonb_build_object(
    'event_id', 'log-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
    'email', 'trunc@log.in', 'first_name', repeat('n', 500), 'error_message', repeat('e', 5000)));
  perform test.ok((select length(first_name) = 100 and length(error_message) = 2000
                     from public.registration_log where email = 'trunc@log.in'),
    'long fields are truncated to their caps');
end $$;
rollback;

-- ── Flood limit: 60 per browser in ten minutes ──────────────────────────────
begin;
set local role anon;
do $$
declare
  i integer;
  accepted integer := 0;
begin
  perform test.act_as(null);
  for i in 1..65 loop
    if public.log_registration_event(jsonb_build_object(
         'event_id', 'log-2026', 'flow', 'SOLO', 'stage', 'SUBMIT', 'status', 'FAILED',
         'client_id', 'flooder', 'email', 'f' || i || '@log.in')) then
      accepted := accepted + 1;
    end if;
  end loop;
  perform test.ok(accepted = 60, format('flood: one browser is cut off after 60 rows (accepted %s)', accepted));
end $$;
rollback;

-- ── Signed-in non-admins: no reading ────────────────────────────────────────
begin;
set local role authenticated;
do $$
declare
  denied boolean := false;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000b');   -- stats viewer
  begin
    perform public.admin_registration_log('log-2026');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'stats viewer: cannot read the log (it holds emails and phones)');

  perform test.act_as('00000000-0000-0000-0000-00000000000d');   -- stranger
  denied := false;
  begin
    perform public.admin_registration_log('log-2026');
  exception when insufficient_privilege then
    denied := true;
  end;
  perform test.ok(denied, 'stranger: cannot read the log');
end $$;
rollback;

-- ── Admin ───────────────────────────────────────────────────────────────────
begin;
set local role authenticated;
do $$
declare
  res  jsonb;
  live jsonb;
begin
  perform test.act_as('00000000-0000-0000-0000-00000000000a');

  res := public.admin_registration_log('log-2026');
  perform test.ok((res->>'total')::integer = 4, 'admin: sees every row of the event');
  perform test.ok((res->'rows'->0->>'status') = 'OK', 'admin: newest first');

  select jsonb_object_agg(r->>'email', r->'has_live_entry') into live
    from jsonb_array_elements(res->'rows') r
   where r->>'status' = 'FAILED';
  perform test.ok((live->>'stuck@log.in')::boolean = false,
    'has_live_entry: false when the only entry is cancelled (email matched case-insensitively)');
  perform test.ok((live->>'live@log.in')::boolean = true,
    'has_live_entry: true once the runner got a live entry');
  perform test.ok((live->>'captain@log.in')::boolean = true,
    'has_live_entry: a coordinator of a live group counts');

  res := public.admin_registration_log('log-2026', p_stuck_only => true);
  perform test.ok((res->>'total')::integer = 1 and res->'rows'->0->>'email' = 'stuck@log.in',
    'stuck only: just the person who failed and never got in');
  perform test.ok((res->'summary'->>'stuck')::integer = 1, 'summary: one person stuck');
  perform test.ok((res->'summary'->>'failed')::integer = 3, 'summary: three failures');

  res := public.admin_registration_log('log-2026', p_status => 'failed', p_stage => 'payment');
  perform test.ok((res->>'total')::integer = 1, 'filters: status and stage, case-insensitive');

  res := public.admin_registration_log('log-2026', p_search => 'unique_email');
  perform test.ok((res->>'total')::integer = 1, 'search: matches the raw error message');

  res := public.admin_registration_log('log-2026', p_limit => 2, p_offset => 2);
  perform test.ok(jsonb_array_length(res->'rows') = 2 and (res->>'total')::integer = 4,
    'paging: limit/offset, total unaffected');
end $$;
rollback;

delete from public.registration_log where event_id = 'log-2026';

\ir cleanup.sql
