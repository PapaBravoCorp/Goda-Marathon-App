-- 0026_coupon_schedule_and_offer_mode.sql
--
-- Two offer settings the organisers kept asking for code changes to get, made
-- into admin settings so the next change is a form edit, not a deploy.
--
--   1. A SCHEDULED CHANGE on any code: "GODA is 20% until 29 Nov, 10% from
--      30 Nov". The code keeps its name, so posters and messages that already
--      say "use GODA" stay true; only what it is worth changes, on the date the
--      admin set, with nobody awake at midnight to do it. Set in
--      Admin -> Coupons -> Edit -> "Scheduled change".
--
--   2. HOW THE SITE'S CODE IS OFFERED (events.featured_coupon_auto_apply):
--        true   applied automatically on the registration form (as before)
--        false  shown on the form with an Apply button; the runner applies it
--      Club and ambassador links (?code=XYZ) always apply their own code,
--      whichever is chosen. Set in Admin -> Coupons -> "Site code".
--
-- Coupon dates now follow India time. valid_from / valid_until were compared
-- with the database's date, which is UTC, so a code "valid until 29 Nov"
-- kept working until 05:30 on 30 Nov in Nashik, and a code "valid from
-- 30 Nov" started at 05:30. Organisers type dates as India dates and announce
-- deadlines as midnight India time; the admin panel already shows expiry in
-- the browser's (India) date. evaluate_coupon() is the only place a coupon
-- date is checked, so the switch happens there and nowhere else.
--
-- evaluate_coupon() is replaced; everything else about it is as in 0010. Its
-- answer now says what the code is worth TODAY in discount_value (so the
-- site's "20% off" label is right on either side of the change), and, while a
-- change is still ahead, next_discount_value / next_discount_from, so the site
-- can say "20% off until 29 Nov". preview_coupon(), create_registration() and
-- create_group_registration() all price through it, so the quote, the stored
-- entry and the payment agree, as before.
--
-- Entries already made are not re-priced: their discount is stored on the row
-- (0010). A scheduled change only affects entries made on or after its date.
--
-- The frontend treats a missing featured_coupon_auto_apply as true and a
-- missing schedule as none, so deploying it before this file runs changes
-- nothing; the admin panel says this file is needed if a new setting is used.
--
-- Safe to re-run. Run after 0025.
-- Rollback: supabase/rollbacks/0026_coupon_schedule_and_offer_mode.down.sql.

begin;

-- ── 1. Scheduled change on a coupon ─────────────────────────────────────────
alter table public.coupons
  add column if not exists next_discount_value numeric(10, 2),
  add column if not exists next_discount_from  date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coupons_next_discount_check') then
    alter table public.coupons
      add constraint coupons_next_discount_check
      check (
        -- Both or neither: a value with no date, or a date with no value,
        -- is a half-entered form, not a schedule.
        (next_discount_value is null) = (next_discount_from is null)
        and (next_discount_value is null or next_discount_value > 0)
        and (next_discount_value is null or discount_type = 'FLAT' or next_discount_value <= 100)
      );
  end if;
end $$;

comment on column public.coupons.next_discount_value is
  'What the code is worth from next_discount_from (India date) onwards, in the code''s own discount_type. NULL = no change scheduled. Entries made before the date keep the discount they were given.';
comment on column public.coupons.next_discount_from is
  'India date the scheduled change takes effect (from 00:00 IST). Set together with next_discount_value.';

-- ── 2. How the site's code is offered ──────────────────────────────────────
alter table public.events
  add column if not exists featured_coupon_auto_apply boolean not null default true;

comment on column public.events.featured_coupon_auto_apply is
  'true: the featured code is applied automatically on the registration form. false: it is shown with an Apply button and the runner applies it. Link codes (?code=) are applied either way.';

-- ── 3. Coupon evaluation: India dates and the scheduled change ─────────────
-- As 0010, with three changes, each marked below: dates are compared with
-- today's date in India, the discount uses the value in force today, and the
-- answer carries the upcoming change (if any) and the end date.
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
  -- 0026: the event is in India and organisers enter India dates.
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_value     numeric(10, 2);
  v_pending   boolean := false;
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

  -- 0026: v_today (India) instead of current_date (UTC).
  if v_coupon.valid_from is not null and v_today < v_coupon.valid_from then
    return jsonb_build_object('valid', false, 'reason', 'COUPON_NOT_STARTED',
      'subtotal', v_subtotal, 'discount', 0, 'total', v_subtotal,
      'valid_from', v_coupon.valid_from);
  end if;

  if v_coupon.valid_until is not null and v_today > v_coupon.valid_until then
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

  -- 0026: the value in force today. From next_discount_from onwards the
  -- scheduled value replaces discount_value; before it, the change is
  -- "pending" and reported so the site can show the deadline.
  v_value := v_coupon.discount_value;
  if v_coupon.next_discount_from is not null and v_coupon.next_discount_value is not null then
    if v_today >= v_coupon.next_discount_from then
      v_value := v_coupon.next_discount_value;
    else
      v_pending := true;
    end if;
  end if;

  if v_coupon.discount_type = 'PERCENT' then
    v_discount := v_eligible * v_value / 100.0;
    if v_coupon.max_discount is not null then
      v_discount := least(v_discount, v_coupon.max_discount);
    end if;
  else
    v_discount := v_value;
  end if;

  -- Never below zero, and never more than the part of the basket it applies
  -- to: a Rs 500 flat code on a Rs 300 entry takes 300 off, not 500.
  v_discount := greatest(least(v_discount, v_eligible), 0);

  -- Whole rupees, always, rounded down (see 0010 for why).
  v_discount := trunc(v_discount);

  return jsonb_build_object(
    'valid',           true,
    'coupon_id',       v_coupon.id,
    'code',            v_coupon.code,
    'description',     v_coupon.description,
    'discount_type',   v_coupon.discount_type,
    -- 0026: the value in force today, not necessarily the row's discount_value.
    'discount_value',  v_value,
    'applies_to_categories', to_jsonb(v_coupon.applies_to_categories),
    'subtotal',        v_subtotal,
    'eligible_subtotal', v_eligible,
    'discount',        v_discount,
    'total',           v_subtotal - v_discount,
    -- 0026: deadlines the site can show. Null when there is none.
    'valid_until',         v_coupon.valid_until,
    'next_discount_value', case when v_pending then v_coupon.next_discount_value end,
    'next_discount_from',  case when v_pending then v_coupon.next_discount_from end
  );
end $$;

-- Unchanged from 0011: internal only. preview_coupon() and the registration
-- functions run as the owner and call it on the caller's behalf.
revoke all on function public.evaluate_coupon(text, text[], text, boolean) from public, anon, authenticated;

commit;
