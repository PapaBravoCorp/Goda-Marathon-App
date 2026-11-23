-- Rollback for 0026_coupon_schedule_and_offer_mode.sql.
--
-- Puts evaluate_coupon() back exactly as 0010 wrote it (UTC dates, no
-- scheduled change), then removes the two settings. No registration, payment
-- or coupon row is touched: entries keep the discount stored on them. A code
-- that had already switched to its scheduled value goes back to its original
-- discount_value -- edit the code in Admin -> Coupons if that is not wanted.
-- Deploy the previous frontend first, or leave the columns in place: the
-- older frontend ignores them.

begin;

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

revoke all on function public.evaluate_coupon(text, text[], text, boolean) from public, anon, authenticated;

alter table public.coupons
  drop constraint if exists coupons_next_discount_check;

alter table public.coupons
  drop column if exists next_discount_value,
  drop column if exists next_discount_from;

alter table public.events
  drop column if exists featured_coupon_auto_apply;

commit;
