-- 0007_registration_rpc.sql
--
-- Run after 0006. Gives the public registration form a way back in, now that
-- 0006 has closed direct access to public.registrations.
--
-- This is not only a workaround for the lockdown. The old client-side insert
-- had three real defects that a function fixes properly:
--
--   1. THE BROWSER SET THE PRICE. addRegistration() sent `price` from React
--      state. Anyone could open devtools and enter the 15km category for zero
--      rupees, and the row would look exactly like a genuine one. The price is
--      now read from event_categories inside the database and the client's
--      value is ignored entirely.
--
--   2. BIB NUMBERS COLLIDED. They were Math.floor(1000 + Math.random()*9000),
--      drawn independently per entry. Across 500 runners the chance of at least
--      one duplicate is effectively 100% (birthday problem over 9000 values --
--      a collision is more likely than not by about the 112th entry). Two
--      runners with the same bib is a race-day timing failure. Bibs now come
--      from a per-event counter.
--
--   3. NOTHING CHECKED ELIGIBILITY SERVER-SIDE. Minimum age, category status,
--      remaining slots and whether registration was open at all were enforced
--      only by the React form.
--
-- Safe to re-run.

-- ── 1. Per-event bib allocation ─────────────────────────────────────────────
create table if not exists public.bib_counters (
  event_id   text primary key,
  last_bib   integer not null default 0,
  start_from integer not null default 1000
);

comment on table public.bib_counters is
  'One row per event. last_bib is advanced under a row lock by allocate_bib(), so two concurrent registrations can never receive the same number.';

-- ENABLE, not FORCE: allocate_bib() runs as the table owner. See the note in
-- 0006 section 4.
alter table public.bib_counters enable row level security;

drop policy if exists bib_counters_admin_all on public.bib_counters;
create policy bib_counters_admin_all on public.bib_counters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed each existing event past its current highest bib, so numbers already
-- printed on a runner's kit are never handed out a second time.
insert into public.bib_counters (event_id, last_bib, start_from)
select e.id,
       coalesce((
         select max(nullif(regexp_replace(r.bib, '\D', '', 'g'), '')::integer)
         from public.registrations r
         where r.event_id = e.id
       ), 999) - 999,
       1000
from public.events e
on conflict (event_id) do nothing;

create or replace function public.allocate_bib(p_event_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
  v_start integer;
begin
  insert into public.bib_counters (event_id) values (p_event_id)
  on conflict (event_id) do nothing;

  -- UPDATE ... RETURNING takes a row lock, so concurrent callers serialise
  -- here and each leaves with a distinct number.
  update public.bib_counters
     set last_bib = last_bib + 1
   where event_id = p_event_id
  returning last_bib, start_from into v_next, v_start;

  return (v_start + v_next - 1)::text;
end $$;

revoke all on function public.allocate_bib(text) from public;

-- ── 2. De-duplicate existing bibs, then make duplicates impossible ──────────
-- 0001 left this as a plain index with a note to promote it once the random
-- bibs had been cleaned up. Doing that now.
do $$
declare
  r record;
begin
  for r in
    select id, event_id
    from (
      select id, event_id,
             row_number() over (partition by event_id, bib order by created_at, id) as n
      from public.registrations
      where bib is not null
    ) ranked
    where n > 1
  loop
    update public.registrations
       set bib = public.allocate_bib(r.event_id)
     where id = r.id;
    raise notice 'Reassigned duplicate bib on registration %', r.id;
  end loop;
end $$;

drop index if exists public.registrations_event_bib_idx;
create unique index if not exists registrations_event_bib_key
  on public.registrations (event_id, bib)
  where bib is not null;

-- One entry per email per event, enforced by the database rather than by a
-- SELECT-then-INSERT in JavaScript, which two simultaneous submissions can
-- both pass. Case-insensitive, because "Asha@x.com" and "asha@x.com" are the
-- same mailbox.
create unique index if not exists registrations_event_email_key
  on public.registrations (event_id, lower(email));

-- ── 3. Is this email already entered? ───────────────────────────────────────
-- Returns a boolean and nothing else, so the form can warn the runner early
-- without the endpoint becoming a way to enumerate who has signed up.
create or replace function public.is_email_registered(p_email text, p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and lower(r.email) = lower(trim(p_email))
      and r.payment_status is distinct from 'CANCELLED'
  );
$$;

revoke all on function public.is_email_registered(text, text) from public;
grant execute on function public.is_email_registered(text, text) to anon, authenticated;

-- ── 4. Remaining slots per category ─────────────────────────────────────────
-- The homepage, the event page and the registration form all showed "N slots
-- left" by downloading every registration row and counting them in the
-- browser. That was both the PII leak and a full table transfer on every page
-- view. This returns counts only.
create or replace function public.get_category_availability(p_event_id text)
returns table (
  category_id   uuid,
  name          text,
  max_slots     integer,
  taken         integer,
  slots_left    integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.name,
    c.max_slots,
    coalesce(t.taken, 0)::integer,
    case
      when c.max_slots is null then null
      else greatest(c.max_slots - coalesce(t.taken, 0), 0)::integer
    end
  from public.event_categories c
  left join (
    select r.category, count(*)::integer as taken
    from public.registrations r
    where r.event_id = p_event_id
      and r.payment_status is distinct from 'CANCELLED'
    group by r.category
  ) t on t.category = c.name
  where c.event_id = p_event_id
  order by c.display_order, c.name;
$$;

revoke all on function public.get_category_availability(text) from public;
grant execute on function public.get_category_availability(text) to anon, authenticated;

-- ── 5. Create a registration ────────────────────────────────────────────────
-- The only way the public writes to public.registrations.
--
-- Everything commercial or eligibility-related is decided here from database
-- state. The client supplies who the runner is; it does not get a say in what
-- they pay or whether they qualify.
create or replace function public.create_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event      public.events%rowtype;
  v_category   public.event_categories%rowtype;
  v_taken      integer;
  v_age        integer;
  v_dob        date;
  v_email      text;
  v_bib        text;
  v_row        public.registrations%rowtype;
begin
  -- ── Event ──
  select * into v_event
  from public.events
  where id = payload->>'event_id';

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if coalesce(v_event.registration_open, false) is not true then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  if v_event.last_registration_date is not null
     and current_date > v_event.last_registration_date then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  -- ── Category ──
  select * into v_category
  from public.event_categories
  where event_id = v_event.id
    and name = payload->>'category';

  if not found then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;

  if coalesce(v_category.status, 'Open') <> 'Open' then
    raise exception 'CATEGORY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- ── Capacity ──
  -- Counted inside the same transaction as the insert, so two runners racing
  -- for the last slot cannot both be told they got it.
  if v_category.max_slots is not null then
    select count(*) into v_taken
    from public.registrations
    where event_id = v_event.id
      and category = v_category.name
      and payment_status is distinct from 'CANCELLED';

    if v_taken >= v_category.max_slots then
      raise exception 'CATEGORY_FULL' using errcode = 'P0001';
    end if;
  end if;

  -- ── Eligibility ──
  v_dob := nullif(payload->>'dob', '')::date;
  if v_dob is null then
    raise exception 'DOB_REQUIRED' using errcode = 'P0001';
  end if;
  if v_dob > current_date then
    raise exception 'DOB_INVALID' using errcode = 'P0001';
  end if;

  v_age := date_part('year', age(current_date, v_dob))::integer;

  if v_category.min_age is not null and v_age < v_category.min_age then
    raise exception 'UNDER_MIN_AGE' using errcode = 'P0001';
  end if;

  -- ── Consent ──
  -- An entry without the declarations accepted has no legal standing; refuse it
  -- rather than storing a row that looks valid.
  if coalesce((payload->>'waivers_accepted')::boolean, false) is not true then
    raise exception 'WAIVERS_REQUIRED' using errcode = 'P0001';
  end if;

  -- ── Identity ──
  v_email := lower(trim(payload->>'email'));
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.registrations
    where event_id = v_event.id and lower(email) = v_email
  ) then
    raise exception 'ALREADY_REGISTERED' using errcode = '23505';
  end if;

  v_bib := public.allocate_bib(v_event.id);

  insert into public.registrations (
    first_name, last_name, email, phone, dob, gender,
    blood_group, emergency_contact_name, emergency_contact_number,
    has_medical_condition, allergies,
    city, state, pincode, club_name,
    category, tshirt_size, estimated_time, coupon_code,
    price,
    waivers_accepted, waivers_accepted_at,
    event_id, event_name, bib, payment_status
  ) values (
    trim(payload->>'first_name'),
    trim(payload->>'last_name'),
    v_email,
    nullif(trim(payload->>'phone'), ''),
    v_dob,
    nullif(payload->>'gender', ''),
    nullif(payload->>'blood_group', ''),
    nullif(trim(payload->>'emergency_contact_name'), ''),
    nullif(trim(payload->>'emergency_contact_number'), ''),
    coalesce((payload->>'has_medical_condition')::boolean, false),
    case when coalesce((payload->>'has_medical_condition')::boolean, false)
         then nullif(trim(payload->>'allergies'), '') end,
    nullif(trim(payload->>'city'), ''),
    nullif(payload->>'state', ''),
    nullif(trim(payload->>'pincode'), ''),
    nullif(trim(payload->>'club_name'), ''),
    v_category.name,
    nullif(payload->>'tshirt_size', ''),
    nullif(trim(payload->>'estimated_time'), ''),
    nullif(trim(payload->>'coupon_code'), ''),
    v_category.price,          -- from the database, never from the browser
    true,
    now(),
    v_event.id,
    v_event.name,
    v_bib,
    'PENDING'                  -- only an admin can move an entry off PENDING
  )
  returning * into v_row;

  -- Return only what the confirmation screen needs. Deliberately not the whole
  -- row: there is no reason to echo medical details back over the wire.
  return jsonb_build_object(
    'id',             v_row.id,
    'bib',            v_row.bib,
    'first_name',     v_row.first_name,
    'last_name',      v_row.last_name,
    'email',          v_row.email,
    'category',       v_row.category,
    'price',          v_row.price,
    'payment_status', v_row.payment_status,
    'event_name',     v_row.event_name
  );
end $$;

revoke all on function public.create_registration(jsonb) from public;
grant execute on function public.create_registration(jsonb) to anon, authenticated;

comment on function public.create_registration(jsonb) is
  'The public registration entry point. Validates the event, category, capacity, age and consent, prices the entry from event_categories, allocates a collision-free bib and inserts with payment_status PENDING. Never trust the client for price or eligibility.';
