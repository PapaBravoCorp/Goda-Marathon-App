-- 0010_group_registrations_and_coupons.sql
--
-- Run after 0009. Adds two things the site has been half-pretending to have:
--
--   1. GROUP (BULK) REGISTRATION. A club captain, a company HR lead or a school
--      coach enters everyone in one pass instead of filling the solo form
--      twenty times with the same address and emergency contact.
--
--   2. REAL COUPONS. `registrations.coupon_code` has existed since 0001, but
--      nothing ever read it -- the form said "checked by the organisers" and
--      the code was stored as a souvenir. Someone still had to work out the
--      discount by hand and remember it when collecting payment. Coupons are
--      now rows with rules, and the discount is computed in the database.
--
-- The security posture from 0006/0009 is preserved throughout:
--
--   * The browser never sends a price or a discount. It sends a code. The
--     database looks up what that code is worth. A discount posted from the
--     client is a discount the client can edit.
--   * public.coupons is NOT readable by anon. Were it readable, the codes
--     would be in the JavaScript bundle's reach and every "CLUB20" would be
--     public knowledge the day it was created. The only way in is
--     preview_coupon(), which answers about ONE code you already know.
--   * public.registration_groups holds captain contact details, so it is
--     admin-only for the same reasons registrations is.
--
-- Safe to re-run.

-- ── 1. Coupons ──────────────────────────────────────────────────────────────
create table if not exists public.coupons (
  id             uuid primary key default gen_random_uuid(),
  event_id       text not null references public.events (id) on delete cascade,

  code           text not null,
  description    text,

  discount_type  text not null default 'PERCENT'
                 check (discount_type in ('PERCENT', 'FLAT')),
  discount_value numeric(10, 2) not null check (discount_value > 0),

  -- Ceiling for a percentage coupon. "20% off, up to Rs 500" is the usual
  -- shape of a sponsor deal, and without a cap a 20% code on a large group
  -- gives away more than anyone intended.
  max_discount   numeric(10, 2) check (max_discount is null or max_discount > 0),

  -- The group-discount lever: a code that only pays out from N entrants up.
  min_participants integer not null default 1 check (min_participants >= 1),

  -- NULL means every category. Otherwise the discount applies only to the
  -- entrants in these categories; the rest of the group pays full price. It
  -- does not reject the whole group, because a mixed club entry -- eight in
  -- the 10K, two in the half -- is the normal case, not an error.
  applies_to_categories text[],

  -- Where the code may be used. A negotiated corporate rate has no business
  -- being typed into the solo form by a stranger who saw it on a poster.
  scope          text not null default 'ANY'
                 check (scope in ('ANY', 'GROUP_ONLY', 'SOLO_ONLY')),

  valid_from     date,
  valid_until    date,

  -- One redemption is one checkout: a group of thirty counts once, not thirty
  -- times. NULL is unlimited.
  max_uses       integer check (max_uses is null or max_uses > 0),
  uses           integer not null default 0,

  is_active      boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text
);

comment on table public.coupons is
  'Discount codes. Never exposed to anon: the only public read path is preview_coupon(), which answers about a single code the caller already knows.';
comment on column public.coupons.uses is
  'Redemptions, not participants. A group entry increments this by one however many runners it covers.';
comment on column public.coupons.applies_to_categories is
  'NULL = all categories. Otherwise the discount is computed only on the entrants in these categories; others in the same group pay full price.';

-- Codes are matched case-insensitively -- a runner typing "club20" means the
-- same thing as "CLUB20" -- so uniqueness has to be case-insensitive too, or
-- two rows could both answer to the same typed code.
create unique index if not exists coupons_event_code_key
  on public.coupons (event_id, upper(code));

create index if not exists coupons_event_active_idx
  on public.coupons (event_id) where is_active;

alter table public.coupons enable row level security;

-- ── 2. Registration groups ──────────────────────────────────────────────────
-- One row per bulk entry. The captain's details live here once instead of
-- being copied onto every participant row.
create sequence if not exists public.registration_group_seq start 1001;

create table if not exists public.registration_groups (
  id            uuid primary key default gen_random_uuid(),
  group_code    text not null unique,
  event_id      text not null references public.events (id) on delete cascade,
  event_name    text,

  -- Who is organising and paying. Not necessarily a runner: a club secretary
  -- or an HR coordinator frequently enters a team they are not part of, so
  -- there is no registration row for the captain unless they add themselves
  -- as a participant.
  captain_first_name text not null,
  captain_last_name  text,
  captain_email      text not null,
  captain_phone      text,
  organisation_name  text,

  city          text,
  state         text,
  pincode       text,

  -- Inherited by any participant who did not give their own. The captain is
  -- the fallback the medical team calls on race day.
  emergency_contact_name   text,
  emergency_contact_number text,

  participant_count integer not null default 0,

  -- The money, as computed by the database at the moment of entry. Kept on the
  -- row rather than recomputed later, because a coupon can be edited or
  -- deactivated afterwards and what the group was actually quoted must not
  -- change retroactively.
  subtotal      numeric(10, 2) not null default 0,
  discount      numeric(10, 2) not null default 0,
  total         numeric(10, 2) not null default 0,

  coupon_id     uuid references public.coupons (id) on delete set null,
  coupon_code   text,

  payment_status text not null default 'PENDING',

  waivers_accepted    boolean not null default false,
  waivers_accepted_at timestamptz,

  created_at    timestamptz not null default now()
);

comment on table public.registration_groups is
  'One row per bulk entry. Participants are the public.registrations rows pointing at it via group_id.';
comment on column public.registration_groups.total is
  'What the group was quoted at entry. Frozen deliberately: editing a coupon later must not silently re-price an entry someone has already been invoiced for.';

create index if not exists registration_groups_event_idx
  on public.registration_groups (event_id, created_at desc);

alter table public.registration_groups enable row level security;

-- ── 3. Registrations: group link and the price breakdown ────────────────────
alter table public.registrations
  add column if not exists group_id        uuid references public.registration_groups (id) on delete set null,
  add column if not exists list_price      numeric(10, 2),
  add column if not exists discount_amount numeric(10, 2) not null default 0;

-- `price` keeps its original meaning -- what this entrant owes -- so
-- getStats()'s revenue sum stays correct without being touched. The new
-- columns say what it was before the discount and how much came off.
comment on column public.registrations.price is
  'Amount payable by this entrant, after any coupon. list_price - discount_amount.';
comment on column public.registrations.list_price is
  'The category price before any discount. NULL on rows created before 0010, where it equals price.';
comment on column public.registrations.discount_amount is
  'This entrant''s share of the coupon discount. A group discount is apportioned across members in proportion to their category price, so the shares sum exactly to the group total.';

-- Backfill: every pre-0010 row was charged list price with nothing off.
update public.registrations
   set list_price = price
 where list_price is null;

create index if not exists registrations_group_idx
  on public.registrations (group_id) where group_id is not null;

-- ── 4. Coupon evaluation, in one place ──────────────────────────────────────
-- Shared by preview_coupon(), create_registration() and
-- create_group_registration(), so the number quoted on the confirm screen and
-- the number stored on the row come from the same code path. Two
-- implementations of a discount rule is two implementations that disagree.
--
-- Takes the category name of every entrant in the transaction, because the
-- discount depends on the mix: minimum group size, per-category eligibility
-- and a percentage cap all need the whole basket.
--
-- Returns jsonb rather than raising, so the preview can explain a refusal
-- without the caller treating it as a failure.
create or replace function public.evaluate_coupon(
  p_event_id   text,
  p_categories text[],
  p_code       text,
  p_is_group   boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_coupon    public.coupons%rowtype;
  v_code      text;
  v_count     integer;
  v_subtotal  numeric(10, 2) := 0;
  v_eligible  numeric(10, 2) := 0;
  v_discount  numeric(10, 2) := 0;
  v_cat       text;
  v_price     numeric(10, 2);
begin
  v_count := coalesce(array_length(p_categories, 1), 0);
  if v_count = 0 then
    return jsonb_build_object('valid', false, 'reason', 'NO_PARTICIPANTS');
  end if;

  -- Price the basket from event_categories. An unknown category is left at
  -- zero here; create_registration() and create_group_registration() reject it
  -- outright, and this function must not be the thing that decides that.
  foreach v_cat in array p_categories loop
    select c.price into v_price
    from public.event_categories c
    where c.event_id = p_event_id and c.name = v_cat;

    v_price := coalesce(v_price, 0);
    v_subtotal := v_subtotal + v_price;
  end loop;

  v_code := nullif(upper(trim(coalesce(p_code, ''))), '');

  if v_code is null then
    return jsonb_build_object(
      'valid', false, 'reason', 'NO_CODE',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal
    );
  end if;

  select * into v_coupon
  from public.coupons
  where event_id = p_event_id and upper(code) = v_code;

  -- Every refusal below returns the undiscounted basket alongside the reason,
  -- so the confirm screen can keep showing a correct total while it explains
  -- why the code did nothing.
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_NOT_FOUND',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal);
  end if;

  if not v_coupon.is_active then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_INACTIVE',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal);
  end if;

  if v_coupon.valid_from is not null and current_date < v_coupon.valid_from then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_NOT_STARTED',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal,
      'valid_from', v_coupon.valid_from);
  end if;

  if v_coupon.valid_until is not null and current_date > v_coupon.valid_until then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_EXPIRED',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal);
  end if;

  if v_coupon.max_uses is not null and v_coupon.uses >= v_coupon.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_EXHAUSTED',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal);
  end if;

  if v_coupon.scope = 'GROUP_ONLY' and not p_is_group then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_GROUP_ONLY',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal,
      'min_participants', v_coupon.min_participants);
  end if;

  if v_coupon.scope = 'SOLO_ONLY' and p_is_group then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_SOLO_ONLY',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal);
  end if;

  if v_count < v_coupon.min_participants then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_MIN_PARTICIPANTS',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal,
      'min_participants', v_coupon.min_participants);
  end if;

  -- Which of the basket the discount may be computed on.
  foreach v_cat in array p_categories loop
    if v_coupon.applies_to_categories is null
       or v_cat = any (v_coupon.applies_to_categories) then
      select c.price into v_price
      from public.event_categories c
      where c.event_id = p_event_id and c.name = v_cat;
      v_eligible := v_eligible + coalesce(v_price, 0);
    end if;
  end loop;

  if v_eligible <= 0 then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_CATEGORY_NOT_ELIGIBLE',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal,
      'applies_to_categories', to_jsonb(v_coupon.applies_to_categories));
  end if;

  if v_coupon.discount_type = 'PERCENT' then
    v_discount := v_eligible * v_coupon.discount_value / 100.0;
    if v_coupon.max_discount is not null then
      v_discount := least(v_discount, v_coupon.max_discount);
    end if;
  else
    v_discount := v_coupon.discount_value;
  end if;

  -- Never below zero, and never more than the part of the basket it applies
  -- to: a Rs 500 flat code on a Rs 300 entry takes 300 off, not 500.
  v_discount := greatest(least(v_discount, v_eligible), 0);

  -- Whole rupees, always.
  --
  -- Entry fees on this event are whole rupees (the admin form parses the
  -- category price with parseInt), and registrations.price was created outside
  -- these migrations, so its type is not guaranteed to hold paise. A discount
  -- of 149.50 against an integer column would be silently rounded on insert,
  -- and the group's member rows would then no longer sum to the total the
  -- coordinator was quoted. Truncating here -- in the one function both the
  -- quote and the insert go through -- means that cannot happen, and rounding
  -- down keeps the rounding in the runner's favour rather than the
  -- organiser's.
  v_discount := trunc(v_discount);

  return jsonb_build_object(
    'valid',           true,
    'coupon_id',       v_coupon.id,
    'code',            v_coupon.code,
    'description',     v_coupon.description,
    'discount_type',   v_coupon.discount_type,
    'discount_value',  v_coupon.discount_value,
    'applies_to_categories', to_jsonb(v_coupon.applies_to_categories),
    'subtotal',        v_subtotal,
    'eligible_subtotal', v_eligible,
    'discount',        v_discount,
    'total',           v_subtotal - v_discount
  );
end $$;

revoke all on function public.evaluate_coupon(text, text[], text, boolean) from public;

-- ── 5. Public coupon preview ────────────────────────────────────────────────
-- Lets the form say "CLUB20 applied - Rs 1,600 off" before submission instead
-- of the runner finding out at payment time.
--
-- It answers only about a code the caller already typed, and returns nothing
-- that would help guess another one, so it is not an enumeration route into
-- the coupons table. There is no listing endpoint by design.
create or replace function public.preview_coupon(
  p_code       text,
  p_event_id   text,
  p_categories text[],
  p_is_group   boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.evaluate_coupon(p_event_id, p_categories, p_code, p_is_group);
$$;

revoke all on function public.preview_coupon(text, text, text[], boolean) from public;
grant execute on function public.preview_coupon(text, text, text[], boolean) to anon, authenticated;

comment on function public.preview_coupon(text, text, text[], boolean) is
  'Quote a code against a basket of categories. Returns {valid, discount, total, reason}. Deliberately per-code: there is no function that lists coupons to the public.';

-- ── 6. Claim a redemption ───────────────────────────────────────────────────
-- Separate from evaluate_coupon(), which is STABLE and must stay read-only.
--
-- The guard is in the WHERE clause rather than in a preceding SELECT, because
-- a check-then-update lets two simultaneous redemptions of the last remaining
-- use both pass the check. If the row does not come back, the code ran out
-- between the quote and the commit.
create or replace function public.claim_coupon_use(p_coupon_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_ok uuid;
begin
  if p_coupon_id is null then
    return true;
  end if;

  update public.coupons
     set uses = uses + 1, updated_at = now()
   where id = p_coupon_id
     and is_active
     and (max_uses is null or uses < max_uses)
  returning id into v_ok;

  return v_ok is not null;
end $$;

revoke all on function public.claim_coupon_use(uuid) from public;

-- ── 7. Solo registration, now coupon-aware ──────────────────────────────────
-- Replaces the 0007 version. Same validation, same guarantees; the only change
-- is that a coupon code is now evaluated instead of merely stored, and the
-- price is split into list_price / discount_amount / price.
--
-- An invalid code does NOT reject the entry. A runner who mistypes a code, or
-- uses one that expired yesterday, still wants their place -- they just pay
-- full price. The form has already told them the code did not apply; failing
-- the submission here would lose the whole entry over a typo.
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
  v_quote      jsonb;
  v_coupon_id  uuid;
  v_discount   numeric(10, 2) := 0;
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

  -- ── Coupon ──
  if nullif(trim(coalesce(payload->>'coupon_code', '')), '') is not null then
    v_quote := public.evaluate_coupon(
      v_event.id, array[v_category.name], payload->>'coupon_code', false
    );

    if (v_quote->>'valid')::boolean then
      v_coupon_id := (v_quote->>'coupon_id')::uuid;
      v_discount  := coalesce((v_quote->>'discount')::numeric, 0);

      -- Claimed before the insert: if the last use was taken in the meantime,
      -- the entry proceeds at full price rather than failing.
      if not public.claim_coupon_use(v_coupon_id) then
        v_coupon_id := null;
        v_discount  := 0;
      end if;
    end if;
  end if;

  v_bib := public.allocate_bib(v_event.id);

  insert into public.registrations (
    first_name, last_name, email, phone, dob, gender,
    blood_group, emergency_contact_name, emergency_contact_number,
    has_medical_condition, allergies,
    city, state, pincode, club_name,
    category, tshirt_size, estimated_time, coupon_code,
    list_price, discount_amount, price,
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
    -- Only a code that actually paid out is recorded, so an organiser reading
    -- the row cannot mistake a rejected code for an honoured one.
    case when v_coupon_id is not null
         then upper(trim(payload->>'coupon_code')) end,
    v_category.price,                    -- from the database, never the browser
    v_discount,
    greatest(v_category.price - v_discount, 0),
    true,
    now(),
    v_event.id,
    v_event.name,
    v_bib,
    'PENDING'                            -- only an admin moves an entry off PENDING
  )
  returning * into v_row;

  return jsonb_build_object(
    'id',             v_row.id,
    'bib',            v_row.bib,
    'first_name',     v_row.first_name,
    'last_name',      v_row.last_name,
    'email',          v_row.email,
    'category',       v_row.category,
    'list_price',     v_row.list_price,
    'discount',       v_row.discount_amount,
    'price',          v_row.price,
    'coupon_code',    v_row.coupon_code,
    'payment_status', v_row.payment_status,
    'event_name',     v_row.event_name
  );
end $$;

revoke all on function public.create_registration(jsonb) from public;
grant execute on function public.create_registration(jsonb) to anon, authenticated;

comment on function public.create_registration(jsonb) is
  'The public solo registration entry point. Validates event, category, capacity, age and consent, prices from event_categories, applies any valid coupon, allocates a collision-free bib and inserts as PENDING. Never trust the client for price or eligibility.';

-- ── 8. Group registration ───────────────────────────────────────────────────
-- The bulk entry point. Everything is one transaction: either the whole team
-- is in, or none of it is. A partial group -- eight rows inserted, then a
-- failure on the ninth -- would leave the captain with an invoice that does
-- not match the team and no way to tell which eight got in.
--
-- Per-participant failures carry the participant's index and name in the
-- error DETAIL, so the form can mark the offending row rather than showing
-- "UNDER_MIN_AGE" over a list of twenty people.
create or replace function public.create_group_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event        public.events%rowtype;
  v_category     public.event_categories%rowtype;
  v_participants jsonb;
  v_p            jsonb;
  v_count        integer;
  v_i            integer;
  v_label        text;

  v_categories   text[] := '{}';
  v_prices       numeric(10, 2)[] := '{}';
  v_eligible     boolean[] := '{}';
  v_emails       text[] := '{}';
  v_dobs         date[] := '{}';

  v_email        text;
  v_dob          date;
  v_age          integer;
  v_cat_name     text;
  v_taken        integer;
  v_wanted       integer;

  v_quote        jsonb;
  v_coupon_id    uuid;
  v_coupon_code  text;
  v_applies      text[];
  v_subtotal     numeric(10, 2) := 0;
  v_eligible_sum numeric(10, 2) := 0;
  v_discount     numeric(10, 2) := 0;
  v_allocated    numeric(10, 2) := 0;
  v_share        numeric(10, 2);
  v_first_elig   integer := null;

  v_captain_email text;
  v_group_id     uuid;
  v_group_code   text;
  v_bib          text;
  v_results      jsonb := '[]'::jsonb;
  v_row          public.registrations%rowtype;
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

  -- ── Consent ──
  -- The captain accepts the declarations on the team's behalf and confirms
  -- they are authorised to do so. Without that the entries have no legal
  -- standing, exactly as in the solo flow.
  if coalesce((payload->>'waivers_accepted')::boolean, false) is not true then
    raise exception 'WAIVERS_REQUIRED' using errcode = 'P0001';
  end if;

  -- ── Captain ──
  if nullif(trim(coalesce(payload#>>'{captain,first_name}', '')), '') is null then
    raise exception 'CAPTAIN_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  v_captain_email := lower(trim(coalesce(payload#>>'{captain,email}', '')));
  if v_captain_email = '' or v_captain_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'CAPTAIN_EMAIL_INVALID' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(payload#>>'{captain,phone}', '')), '') is null then
    raise exception 'CAPTAIN_PHONE_REQUIRED' using errcode = 'P0001';
  end if;

  -- ── Participants ──
  v_participants := coalesce(payload->'participants', '[]'::jsonb);
  v_count := jsonb_array_length(v_participants);

  -- Two is the point at which this form exists at all; below that the solo
  -- flow is the better experience. The upper bound keeps one submission from
  -- holding row locks on every category while it inserts.
  if v_count < 2 then
    raise exception 'GROUP_TOO_SMALL' using errcode = 'P0001';
  end if;
  if v_count > 50 then
    raise exception 'GROUP_TOO_LARGE' using errcode = 'P0001';
  end if;

  -- Pass one: validate everybody and collect the basket. Nothing is written
  -- until every participant has passed, so a bad row on the twentieth entrant
  -- leaves no trace of the first nineteen.
  for v_i in 0 .. v_count - 1 loop
    v_p := v_participants -> v_i;

    -- Used in the error DETAIL so the form can point at the right row.
    v_label := trim(coalesce(v_p->>'first_name', '') || ' ' || coalesce(v_p->>'last_name', ''));
    if v_label = '' then v_label := 'Participant ' || (v_i + 1); end if;

    if nullif(trim(coalesce(v_p->>'first_name', '')), '') is null then
      raise exception 'PARTICIPANT_NAME_REQUIRED' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label)::text;
    end if;

    -- Email: each participant gets their own confirmation and results lookup,
    -- so a shared address would make two runners indistinguishable.
    v_email := lower(trim(coalesce(v_p->>'email', '')));
    if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'PARTICIPANT_EMAIL_INVALID' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label)::text;
    end if;

    -- Within the group: caught here rather than by the unique index, which
    -- would surface as an opaque 23505 naming neither runner.
    if v_email = any (v_emails) then
      raise exception 'DUPLICATE_EMAIL_IN_GROUP' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label, 'email', v_email)::text;
    end if;

    -- ...and against everyone already entered for this event, solo or group.
    if exists (
      select 1 from public.registrations
      where event_id = v_event.id and lower(email) = v_email
    ) then
      raise exception 'ALREADY_REGISTERED' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label, 'email', v_email)::text;
    end if;

    v_dob := nullif(v_p->>'dob', '')::date;
    if v_dob is null then
      raise exception 'DOB_REQUIRED' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label)::text;
    end if;
    if v_dob > current_date then
      raise exception 'DOB_INVALID' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label)::text;
    end if;

    v_cat_name := v_p->>'category';
    select * into v_category
    from public.event_categories
    where event_id = v_event.id and name = v_cat_name;

    if not found then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label, 'category', v_cat_name)::text;
    end if;

    if coalesce(v_category.status, 'Open') <> 'Open' then
      raise exception 'CATEGORY_UNAVAILABLE' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label, 'category', v_cat_name)::text;
    end if;

    v_age := date_part('year', age(current_date, v_dob))::integer;
    if v_category.min_age is not null and v_age < v_category.min_age then
      raise exception 'UNDER_MIN_AGE' using errcode = 'P0001',
        detail = jsonb_build_object(
          'index', v_i, 'name', v_label,
          'category', v_cat_name, 'min_age', v_category.min_age)::text;
    end if;

    v_emails     := v_emails || v_email;
    v_dobs       := v_dobs || v_dob;
    v_categories := v_categories || v_category.name;
    v_prices     := v_prices || v_category.price;
    v_subtotal   := v_subtotal + v_category.price;
  end loop;

  -- ── Capacity, counted per category across the whole group ──
  -- The solo check ("is there at least one place left?") is wrong here: a
  -- category with three places left must not accept a group of ten into it.
  for v_cat_name in select distinct unnest(v_categories) loop
    select * into v_category
    from public.event_categories
    where event_id = v_event.id and name = v_cat_name;

    if v_category.max_slots is not null then
      select count(*) into v_taken
      from public.registrations
      where event_id = v_event.id
        and category = v_cat_name
        and payment_status is distinct from 'CANCELLED';

      select count(*) into v_wanted
      from unnest(v_categories) as t(cat) where t.cat = v_cat_name;

      if v_taken + v_wanted > v_category.max_slots then
        raise exception 'CATEGORY_FULL' using errcode = 'P0001',
          detail = jsonb_build_object(
            'category', v_cat_name,
            'requested', v_wanted,
            'slots_left', greatest(v_category.max_slots - v_taken, 0))::text;
      end if;
    end if;
  end loop;

  -- ── Coupon ──
  -- As in the solo flow, a code that does not apply does not fail the entry.
  -- Twenty people's details are not worth discarding over a mistyped code; the
  -- response says what happened and the confirm screen showed it beforehand.
  if nullif(trim(coalesce(payload->>'coupon_code', '')), '') is not null then
    v_quote := public.evaluate_coupon(
      v_event.id, v_categories, payload->>'coupon_code', true
    );

    if (v_quote->>'valid')::boolean then
      v_coupon_id := (v_quote->>'coupon_id')::uuid;

      if public.claim_coupon_use(v_coupon_id) then
        v_coupon_code  := v_quote->>'code';
        v_discount     := coalesce((v_quote->>'discount')::numeric, 0);
        v_eligible_sum := coalesce((v_quote->>'eligible_subtotal')::numeric, 0);
        v_applies      := case
                            when v_quote->'applies_to_categories' = 'null'::jsonb then null
                            else array(select jsonb_array_elements_text(v_quote->'applies_to_categories'))
                          end;
      else
        -- The last remaining use was taken between the quote and the commit.
        v_coupon_id := null;
        v_quote := jsonb_build_object('valid', false, 'reason', 'COUPON_EXHAUSTED');
      end if;
    end if;
  end if;

  -- Which members the discount is spread over.
  for v_i in 1 .. v_count loop
    v_eligible := v_eligible ||
      (v_applies is null or v_categories[v_i] = any (v_applies));
    if v_first_elig is null and (v_applies is null or v_categories[v_i] = any (v_applies)) then
      v_first_elig := v_i;
    end if;
  end loop;

  -- ── Create the group ──
  v_group_code := 'GRP' || lpad(nextval('public.registration_group_seq')::text, 5, '0');

  insert into public.registration_groups (
    group_code, event_id, event_name,
    captain_first_name, captain_last_name, captain_email, captain_phone,
    organisation_name, city, state, pincode,
    emergency_contact_name, emergency_contact_number,
    participant_count, subtotal, discount, total,
    coupon_id, coupon_code,
    waivers_accepted, waivers_accepted_at
  ) values (
    v_group_code, v_event.id, v_event.name,
    trim(payload#>>'{captain,first_name}'),
    nullif(trim(coalesce(payload#>>'{captain,last_name}', '')), ''),
    v_captain_email,
    nullif(trim(coalesce(payload#>>'{captain,phone}', '')), ''),
    nullif(trim(coalesce(payload#>>'{captain,organisation_name}', '')), ''),
    nullif(trim(coalesce(payload#>>'{captain,city}', '')), ''),
    nullif(coalesce(payload#>>'{captain,state}', ''), ''),
    nullif(trim(coalesce(payload#>>'{captain,pincode}', '')), ''),
    nullif(trim(coalesce(payload#>>'{captain,emergency_contact_name}', '')), ''),
    nullif(trim(coalesce(payload#>>'{captain,emergency_contact_number}', '')), ''),
    v_count, v_subtotal, v_discount, v_subtotal - v_discount,
    v_coupon_id, v_coupon_code,
    true, now()
  )
  returning id into v_group_id;

  -- ── Pass two: insert the participants ──
  for v_i in 1 .. v_count loop
    v_p := v_participants -> (v_i - 1);

    -- Each member's share of the group discount, in proportion to what they
    -- are paying. Whole rupees, floored per member, with the remainder given
    -- to the first eligible one after the loop -- so the shares sum to exactly
    -- the group discount. If they did not, the sum of the member rows would
    -- disagree with the invoice by a rupee or two and every reconciliation
    -- afterwards would be wrong.
    v_share := 0;
    if v_discount > 0 and v_eligible[v_i] and v_eligible_sum > 0 then
      v_share := floor(v_discount * v_prices[v_i] / v_eligible_sum);
      v_allocated := v_allocated + v_share;
    end if;

    v_bib := public.allocate_bib(v_event.id);

    insert into public.registrations (
      first_name, last_name, email, phone, dob, gender,
      blood_group, emergency_contact_name, emergency_contact_number,
      has_medical_condition, allergies,
      city, state, pincode, club_name,
      category, tshirt_size, estimated_time, coupon_code,
      list_price, discount_amount, price,
      waivers_accepted, waivers_accepted_at,
      event_id, event_name, bib, payment_status, group_id
    ) values (
      trim(v_p->>'first_name'),
      nullif(trim(coalesce(v_p->>'last_name', '')), ''),
      v_emails[v_i],
      nullif(trim(coalesce(v_p->>'phone', '')), ''),
      v_dobs[v_i],
      nullif(v_p->>'gender', ''),
      nullif(v_p->>'blood_group', ''),
      -- The captain is the fallback the medical team calls. A group member who
      -- gave no next-of-kin is not left with an empty emergency field on race
      -- day; the organiser has someone to reach.
      coalesce(
        nullif(trim(coalesce(v_p->>'emergency_contact_name', '')), ''),
        nullif(trim(coalesce(payload#>>'{captain,emergency_contact_name}', '')), '')
      ),
      coalesce(
        nullif(trim(coalesce(v_p->>'emergency_contact_number', '')), ''),
        nullif(trim(coalesce(payload#>>'{captain,emergency_contact_number}', '')), ''),
        nullif(trim(coalesce(payload#>>'{captain,phone}', '')), '')
      ),
      coalesce((v_p->>'has_medical_condition')::boolean, false),
      case when coalesce((v_p->>'has_medical_condition')::boolean, false)
           then nullif(trim(coalesce(v_p->>'allergies', '')), '') end,
      -- Address follows the captain unless the member gave their own.
      coalesce(nullif(trim(coalesce(v_p->>'city', '')), ''),
               nullif(trim(coalesce(payload#>>'{captain,city}', '')), '')),
      coalesce(nullif(coalesce(v_p->>'state', ''), ''),
               nullif(coalesce(payload#>>'{captain,state}', ''), '')),
      coalesce(nullif(trim(coalesce(v_p->>'pincode', '')), ''),
               nullif(trim(coalesce(payload#>>'{captain,pincode}', '')), '')),
      coalesce(nullif(trim(coalesce(v_p->>'club_name', '')), ''),
               nullif(trim(coalesce(payload#>>'{captain,organisation_name}', '')), '')),
      v_categories[v_i],
      nullif(v_p->>'tshirt_size', ''),
      nullif(trim(coalesce(v_p->>'estimated_time', '')), ''),
      v_coupon_code,
      v_prices[v_i],
      v_share,
      greatest(v_prices[v_i] - v_share, 0),
      true,
      now(),
      v_event.id,
      v_event.name,
      v_bib,
      'PENDING',
      v_group_id
    )
    returning * into v_row;

    v_results := v_results || jsonb_build_object(
      'id',         v_row.id,
      'bib',        v_row.bib,
      'first_name', v_row.first_name,
      'last_name',  v_row.last_name,
      'email',      v_row.email,
      'category',   v_row.category,
      'list_price', v_row.list_price,
      'discount',   v_row.discount_amount,
      'price',      v_row.price
    );
  end loop;

  -- Give the rounding remainder to the first eligible member, so the sum of
  -- the rows equals the group total to the rupee.
  if v_discount > 0 and v_allocated < v_discount and v_first_elig is not null then
    update public.registrations
       set discount_amount = discount_amount + (v_discount - v_allocated),
           price = greatest(price - (v_discount - v_allocated), 0)
     where group_id = v_group_id
       and bib = (v_results -> (v_first_elig - 1) ->> 'bib');
  end if;

  return jsonb_build_object(
    'group_id',          v_group_id,
    'group_code',        v_group_code,
    'event_name',        v_event.name,
    'captain_email',     v_captain_email,
    'participant_count', v_count,
    'subtotal',          v_subtotal,
    'discount',          v_discount,
    'total',             v_subtotal - v_discount,
    'coupon_code',       v_coupon_code,
    -- Says plainly whether the code was honoured. Without this the captain
    -- cannot tell a coupon that gave nothing from one that was never typed.
    'coupon_applied',    v_coupon_id is not null,
    'coupon_reason',     case when v_coupon_id is null then v_quote->>'reason' end,
    'participants',      v_results
  );
end $$;

revoke all on function public.create_group_registration(jsonb) from public;
grant execute on function public.create_group_registration(jsonb) to anon, authenticated;

comment on function public.create_group_registration(jsonb) is
  'The public bulk registration entry point. Validates every participant, checks per-category capacity for the whole group at once, prices from event_categories, applies any valid coupon across the group and inserts the group plus all members in one transaction. All-or-nothing by design.';

-- ── 9. Admin reads ──────────────────────────────────────────────────────────
-- The dashboard needs group totals next to the member list. A plain select on
-- registration_groups gives the totals; this adds the live count, which drifts
-- from participant_count when an admin cancels one member of a group.
create or replace function public.get_registration_groups(p_event_id text)
returns table (
  id                uuid,
  group_code        text,
  captain_name      text,
  captain_email     text,
  captain_phone     text,
  organisation_name text,
  participant_count integer,
  active_count      integer,
  subtotal          numeric,
  discount          numeric,
  total             numeric,
  coupon_code       text,
  payment_status    text,
  created_at        timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    g.id,
    g.group_code,
    trim(g.captain_first_name || ' ' || coalesce(g.captain_last_name, '')),
    g.captain_email,
    g.captain_phone,
    g.organisation_name,
    g.participant_count,
    (select count(*)::integer from public.registrations r
      where r.group_id = g.id and r.payment_status is distinct from 'CANCELLED'),
    g.subtotal, g.discount, g.total,
    g.coupon_code,
    g.payment_status,
    g.created_at
  from public.registration_groups g
  where (p_event_id is null or g.event_id = p_event_id)
    and public.is_admin()        -- SECURITY DEFINER: the check cannot be skipped
  order by g.created_at desc;
$$;

revoke all on function public.get_registration_groups(text) from public;
grant execute on function public.get_registration_groups(text) to authenticated;

-- How often each code has actually been used, for the admin coupons panel.
create or replace function public.get_coupon_usage(p_event_id text)
returns table (
  coupon_id          uuid,
  redemptions        integer,
  participants       integer,
  discount_given     numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.uses,
    (select count(*)::integer from public.registrations r
      where r.event_id = c.event_id
        and upper(coalesce(r.coupon_code, '')) = upper(c.code)
        and r.payment_status is distinct from 'CANCELLED'),
    (select coalesce(sum(r.discount_amount), 0) from public.registrations r
      where r.event_id = c.event_id
        and upper(coalesce(r.coupon_code, '')) = upper(c.code)
        and r.payment_status is distinct from 'CANCELLED')
  from public.coupons c
  where (p_event_id is null or c.event_id = p_event_id)
    and public.is_admin();
$$;

revoke all on function public.get_coupon_usage(text) from public;
grant execute on function public.get_coupon_usage(text) to authenticated;

-- ── 10. Lock the new tables down ────────────────────────────────────────────
-- Same treatment 0009 gives every private table. Extending _managed_tables()
-- means a future re-run of 0009 covers these two as well, rather than quietly
-- leaving them out the way `events` was left out of 0006.
create or replace function public._managed_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'events', 'event_categories', 'event_schedule',
    'past_events', 'past_events_media', 'faqs', 'testimonials',
    'registrations', 'email_log', 'newsletter_subscribers',
    'bib_counters', 'admin_users',
    'coupons', 'registration_groups'
  ]::text[];
$$;

do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array['coupons', 'registration_groups'] loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy coupons_admin_all on public.coupons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy registration_groups_admin_all on public.registration_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Second layer, independent of RLS: anon holds no privilege on either table,
-- so even a permissive policy added by accident later has nothing to grant.
revoke all on public.coupons             from anon;
revoke all on public.registration_groups from anon;
revoke all on sequence public.registration_group_seq from anon;

-- ── 11. Assert the result ───────────────────────────────────────────────────
-- 0006 reported success while leaving three tables open because nothing
-- checked. Same discipline here.
do $$
declare
  bad      text;
  problems text := '';
begin
  for bad in
    select format('%s.%s (%s)', tablename, policyname, cmd)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('coupons', 'registration_groups')
      and (roles = '{public}' or 'anon' = any (roles))
  loop
    problems := problems || E'\n  - policy reachable by anon: ' || bad;
  end loop;

  for bad in
    select format('%s -> %s', table_name, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('coupons', 'registration_groups')
      and grantee = 'anon'
  loop
    problems := problems || E'\n  - anon still holds a grant: ' || bad;
  end loop;

  if problems <> '' then
    raise exception 'Migration 0010 did not reach the intended state:%', problems;
  end if;

  raise notice '0010 OK: coupons and registration_groups are admin-only; public access is limited to preview_coupon() and create_group_registration().';
end $$;
