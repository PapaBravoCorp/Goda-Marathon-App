-- 0025_registration_log.sql
--
-- Run after 0024. A log of every registration attempt, successful or not,
-- that organisers can read in Admin -> Activity.
--
-- Why: when create_registration() fails, its transaction rolls back and
-- leaves nothing behind. Until 0024 a lapsed reservation made every retry fail
-- on a stray unique constraint, for two weeks, and the only copy of the error
-- was in the runner's own phone browser. The organisers learned about it on
-- WhatsApp.
--
-- The form writes the log, not the registration functions. A function that
-- raises cannot keep a row it wrote, since the raise rolls the row back with
-- everything else. The browser is also the only place that sees failures that
-- never reach the database (a dropped connection, Razorpay refusing a card).
-- What is logged, one row per event:
--
--   DETAILS   the form stopped the runner before submitting (email taken)
--   SUBMIT    create_registration / create_group_registration, OK or FAILED,
--             with the raw Postgres error when it failed
--   PAYMENT   each Razorpay outcome: paid, closed, declined, could not start,
--             paid but unverified, refund needed, reservation expired
--   CANCEL    the runner released their reservation
--
-- Access:
--   * log_registration_event() is callable by anyone. The anon key is public,
--     so it caps field sizes, rate-limits per browser, per email and overall,
--     and accepts only known stages and statuses for an event that exists. It
--     never raises: a logging problem must not stop anyone registering.
--   * The table itself has RLS on and no policies, and grants are revoked, so
--     nobody reads or writes it through the API directly. Organisers read it
--     through admin_registration_log(), which checks is_admin(). Stats viewers
--     get nothing: rows carry emails and phone numbers.
--
-- Rollback: supabase/rollbacks/0025_registration_log.down.sql.
-- Tests: supabase/tests/0025_registration_log.test.sql.
--
-- Safe to re-run. One transaction.

begin;

-- ── 1. The log ──────────────────────────────────────────────────────────────
create table if not exists public.registration_log (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  event_id        text not null,
  flow            text not null check (flow in ('SOLO', 'GROUP')),
  stage           text not null check (stage in ('DETAILS', 'SUBMIT', 'PAYMENT', 'CANCEL')),
  status          text not null check (status in ('OK', 'FAILED', 'ABANDONED', 'INFO')),
  code            text,

  -- Who. For a group, the coordinator.
  email           text,
  first_name      text,
  last_name       text,
  phone           text,
  category        text,
  participant_count integer,

  -- What it produced, when it got that far.
  registration_id uuid,
  group_id        uuid,
  amount          numeric(10, 2),

  -- What went wrong. error_sqlstate and error_details come straight from
  -- PostgREST: "23505" and "Key (email, event_id)=(...) already exists."
  error_message   text,
  error_sqlstate  text,
  error_details   text,
  error_hint      text,
  shown_message   text,   -- what the runner was told

  -- The browser. client_id is a random id kept in that browser, so one
  -- person's repeated attempts can be read together.
  client_id       text,
  client_at       timestamptz,
  user_agent      text,
  page            text,
  context         jsonb
);

comment on table public.registration_log is
  'One row per registration-form event: submit OK/FAILED (with the raw database error), payment outcomes, cancellations, duplicate-email stops. Written by the browser through log_registration_event(); read by organisers through admin_registration_log(). No API access to the table itself.';

create index if not exists registration_log_event_time_idx
  on public.registration_log (event_id, created_at desc);
create index if not exists registration_log_time_idx
  on public.registration_log (created_at);
create index if not exists registration_log_email_idx
  on public.registration_log (lower(email), created_at);
create index if not exists registration_log_client_idx
  on public.registration_log (client_id, created_at);

alter table public.registration_log enable row level security;
revoke all on public.registration_log from anon, authenticated;

-- ── 2. Writing: the public entry point ──────────────────────────────────────
create or replace function public.log_registration_event(p jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event  text := left(nullif(btrim(p->>'event_id'), ''), 100);
  v_flow   text := upper(coalesce(p->>'flow', ''));
  v_stage  text := upper(coalesce(p->>'stage', ''));
  v_status text := upper(coalesce(p->>'status', ''));
  v_email  text := left(lower(nullif(btrim(p->>'email'), '')), 254);
  v_client text := left(nullif(btrim(p->>'client_id'), ''), 64);
  v_ctx    jsonb := p->'context';
  v_client_at timestamptz;
begin
  if p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 20000 then
    return false;
  end if;

  if v_flow not in ('SOLO', 'GROUP')
     or v_stage not in ('DETAILS', 'SUBMIT', 'PAYMENT', 'CANCEL')
     or v_status not in ('OK', 'FAILED', 'ABANDONED', 'INFO') then
    return false;
  end if;

  if v_event is null or not exists (select 1 from public.events where id = v_event) then
    return false;
  end if;

  -- Flood limits. A real runner produces a handful of rows per attempt; these
  -- only stop a script. Overall: 300 a minute. Per browser or per email: 60
  -- in ten minutes.
  if (select count(*) from public.registration_log
       where created_at > now() - interval '1 minute') >= 300 then
    return false;
  end if;
  if v_client is not null and (select count(*) from public.registration_log
       where client_id = v_client and created_at > now() - interval '10 minutes') >= 60 then
    return false;
  end if;
  if v_email is not null and (select count(*) from public.registration_log
       where lower(email) = v_email and created_at > now() - interval '10 minutes') >= 60 then
    return false;
  end if;

  if v_ctx is not null and (jsonb_typeof(v_ctx) <> 'object' or length(v_ctx::text) > 4000) then
    v_ctx := null;
  end if;

  -- The browser's clock, for lining up a queued row with when it happened.
  -- Kept only if it parses and is within a week; otherwise ignored.
  begin
    v_client_at := (p->>'client_at')::timestamptz;
    if v_client_at < now() - interval '7 days' or v_client_at > now() + interval '1 day' then
      v_client_at := null;
    end if;
  exception when others then
    v_client_at := null;
  end;

  insert into public.registration_log (
    event_id, flow, stage, status, code,
    email, first_name, last_name, phone, category, participant_count,
    registration_id, group_id, amount,
    error_message, error_sqlstate, error_details, error_hint, shown_message,
    client_id, client_at, user_agent, page, context
  ) values (
    v_event, v_flow, v_stage, v_status, left(nullif(p->>'code', ''), 60),
    v_email,
    left(nullif(btrim(p->>'first_name'), ''), 100),
    left(nullif(btrim(p->>'last_name'), ''), 100),
    left(nullif(btrim(p->>'phone'), ''), 30),
    left(nullif(btrim(p->>'category'), ''), 300),
    case when (p->>'participant_count') ~ '^[0-9]{1,4}$' then (p->>'participant_count')::integer end,
    case when (p->>'registration_id') ~* '^[0-9a-f-]{36}$' then (p->>'registration_id')::uuid end,
    case when (p->>'group_id') ~* '^[0-9a-f-]{36}$' then (p->>'group_id')::uuid end,
    case when (p->>'amount') ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then (p->>'amount')::numeric end,
    left(nullif(p->>'error_message', ''), 2000),
    left(nullif(p->>'error_sqlstate', ''), 20),
    left(nullif(p->>'error_details', ''), 2000),
    left(nullif(p->>'error_hint', ''), 1000),
    left(nullif(p->>'shown_message', ''), 1000),
    v_client,
    v_client_at,
    left(nullif(p->>'user_agent', ''), 400),
    left(nullif(p->>'page', ''), 200),
    v_ctx
  );

  -- Housekeeping, now and then: the log keeps 180 days.
  if random() < 0.01 then
    delete from public.registration_log where created_at < now() - interval '180 days';
  end if;

  return true;
exception when others then
  -- Logging never gets in the way of registering.
  raise warning 'log_registration_event: %', sqlerrm;
  return false;
end $$;

comment on function public.log_registration_event(jsonb) is
  'Public. Appends one row to registration_log. Validates and truncates every field, rate-limits, and returns false instead of raising, so a logging problem never blocks a registration.';

revoke all on function public.log_registration_event(jsonb) from public;
grant execute on function public.log_registration_event(jsonb) to anon, authenticated;

-- ── 3. Reading: organisers only ─────────────────────────────────────────────
-- Each row says whether that person now holds a live entry: a registration,
-- or a group they coordinate, that is not cancelled -- matched by email or by
-- phone, since someone refused under one address may get in under another.
-- A FAILED row whose person still has none is someone who gave up --
-- p_stuck_only lists just those, newest failure per person.
--
-- (Identical to 0026, which upgrades databases that ran the first version of
-- this file. Keep the two in step.)

-- The last ten digits of a phone number, or NULL when there are fewer: "+91
-- 98765 43210", "09876543210" and "9876543210" are the same phone.
create or replace function public._phone10(p text)
returns text
language sql
immutable
as $$
  select case when length(d) >= 10 then right(d, 10) end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- The email of a live entry (a registration, or a group this person
-- coordinates, that is not cancelled) for this person, matched by email or
-- by phone. NULL when there is none.
create or replace function public._live_entry_email(p_event_id text, p_email text, p_phone text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e from (
    select lower(r.email) as e, 1 as pref
      from public.registrations r
     where r.event_id = p_event_id
       and r.payment_status is distinct from 'CANCELLED'
       and (lower(r.email) = lower(p_email)
            or (public._phone10(p_phone) is not null and public._phone10(r.phone) = public._phone10(p_phone)))
    union all
    select lower(g.captain_email), 2
      from public.registration_groups g
     where g.event_id = p_event_id
       and g.payment_status is distinct from 'CANCELLED'
       and (lower(g.captain_email) = lower(p_email)
            or (public._phone10(p_phone) is not null and public._phone10(g.captain_phone) = public._phone10(p_phone)))
  ) m
  order by (e = lower(p_email)) desc, pref
  limit 1;
$$;

-- Helpers for admin_registration_log(), not for the API.
revoke all on function public._phone10(text) from public, anon, authenticated;
revoke all on function public._live_entry_email(text, text, text) from public, anon, authenticated;

create or replace function public.admin_registration_log(
  p_event_id   text,
  p_status     text    default null,
  p_stage      text    default null,
  p_search     text    default null,
  p_stuck_only boolean default false,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q     text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_rows  jsonb;
  v_total integer;
  v_summary jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  with logged as (
    select l.*,
           live.email is not null as has_live_entry,
           live.email as live_entry_email
      from public.registration_log l
      left join lateral (
        select public._live_entry_email(l.event_id, l.email, l.phone) as email
      ) live on true
     where l.event_id = p_event_id
       and (p_status is null or l.status = upper(p_status))
       and (p_stage is null or l.stage = upper(p_stage))
       and (v_q is null
            or lower(coalesce(l.email, '')) like '%' || v_q || '%'
            or lower(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')) like '%' || v_q || '%'
            or coalesce(l.phone, '') like '%' || v_q || '%'
            or lower(coalesce(l.code, '')) like '%' || v_q || '%'
            or lower(coalesce(l.client_id, '')) = v_q
            or lower(coalesce(l.error_message, '')) like '%' || v_q || '%')
  ),
  picked as (
    select * from logged
     where not p_stuck_only
    union all
    select * from (
      select distinct on (lower(email)) *
        from logged
       where p_stuck_only and status = 'FAILED' and email is not null and not has_live_entry
       order by lower(email), created_at desc
    ) s
  )
  select (select count(*) from picked),
         coalesce((
           select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc)
             from (select * from picked
                    order by created_at desc, id desc
                    limit greatest(least(coalesce(p_limit, 100), 500), 1)
                   offset greatest(coalesce(p_offset, 0), 0)) x
         ), '[]'::jsonb)
    into v_total, v_rows;

  select jsonb_build_object(
           'total',      count(*),
           'failed',     count(*) filter (where l.status = 'FAILED'),
           'failed_24h', count(*) filter (where l.status = 'FAILED' and l.created_at > now() - interval '24 hours'),
           'ok_24h',     count(*) filter (where l.status = 'OK' and l.stage = 'SUBMIT' and l.created_at > now() - interval '24 hours'),
           'stuck',      (select count(distinct lower(f.email))
                            from public.registration_log f
                           where f.event_id = p_event_id and f.status = 'FAILED' and f.email is not null
                             and public._live_entry_email(f.event_id, f.email, f.phone) is null)
         )
    into v_summary
    from public.registration_log l
   where l.event_id = p_event_id;

  return jsonb_build_object('total', v_total, 'rows', v_rows, 'summary', v_summary);
end $$;

comment on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) is
  'Admin only. Pages through registration_log for an event, newest first. Each row carries has_live_entry and live_entry_email: the person (matched by email or phone) holds a live entry. p_stuck_only: the latest failure of each person who still has none. Also returns summary counts.';

revoke all on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) to authenticated;

commit;
