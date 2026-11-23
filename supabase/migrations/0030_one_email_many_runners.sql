-- 0030_one_email_many_runners.sql
--
-- Run after 0029. One email address can now cover several runners -- a parent
-- entering their children, a couple sharing an inbox. The check that stops a
-- runner entering twice is now the email together with the runner's name,
-- instead of the email alone.
--
--   * runner_name_key(first, last): the name as it is compared -- first and
--     last joined, lower-cased, runs of spaces collapsed. "Asha  Patil",
--     "asha patil" and first "Asha Patil" + no last name are the same runner.
--   * The live unique index becomes (event, lower(email), name key) over
--     entries that are not cancelled. The new index is built before the old
--     one is dropped, so there is no moment without one; every existing row
--     already satisfies it, because the old index was stricter.
--   * create_registration() and create_group_registration(): the
--     ALREADY_REGISTERED check, and the within-group DUPLICATE_EMAIL_IN_GROUP
--     check (code kept so a page loaded before this change still reads it),
--     compare email + name. A solo entry now needs a first name (NAME_REQUIRED).
--   * is_runner_registered(email, first, last, event): the details-step check
--     the form makes. is_email_registered() is left as it was, for pages
--     loaded before the new site code; nothing new calls it.
--   * Admin -> Activity: "has an entry now" and "needs follow-up" match the
--     name as well, so one runner's entry no longer hides another runner who
--     shares the email and is still stuck.
--
-- Everything else in the two entry points is copied unchanged from 0017.
-- Confirmation emails were already one per runner (0014), so each runner
-- sharing an address gets their own.
--
-- Rollback: supabase/rollbacks/0030_one_email_many_runners.down.sql (refuses
-- while two live entries share an email). Tests:
-- supabase/tests/0030_one_email_many_runners.test.sql. Safe to re-run.

begin;

-- ── 1. How a name is compared ───────────────────────────────────────────────
-- Immutable, because the unique index below is built on it. Changing this
-- function later means rebuilding that index (REINDEX) in the same step.
create or replace function public.runner_name_key(p_first text, p_last text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(btrim(regexp_replace(coalesce(p_first, '') || ' ' || coalesce(p_last, ''), '\s+', ' ', 'g')));
$$;

comment on function public.runner_name_key(text, text) is
  'A runner''s name as compared for uniqueness: first and last joined, lower-cased, whitespace collapsed. Used by registrations_event_runner_live_key; changing it requires a REINDEX of that index.';

-- ── 2. One live entry per runner (email + name), not per email ──────────────
create unique index if not exists registrations_event_runner_live_key
  on public.registrations (event_id, lower(email), public.runner_name_key(first_name, last_name))
  where payment_status is distinct from 'CANCELLED';

drop index if exists public.registrations_event_email_live_key;

-- ── 3. Solo entry point ─────────────────────────────────────────────────────
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
  v_row        public.registrations%rowtype;
  v_quote      jsonb;
  v_coupon_id  uuid;
  v_discount   numeric(10, 2) := 0;
  v_status     text := 'PENDING';
  v_due        timestamptz;
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

  -- ── Lapsed reservations ──
  -- Release unpaid online reservations whose time ran out before counting
  -- places or checking the email, so an abandoned checkout neither holds a
  -- place nor locks its owner out of trying again.
  perform public.expire_unpaid_holds(v_event.id);

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

  if nullif(trim(coalesce(payload->>'first_name', '')), '') is null then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;

  -- One email may cover several runners (a parent entering their children):
  -- the runner is the email together with the name (0030). A cancelled entry
  -- -- including a reservation that was never paid -- no longer holds it.
  if exists (
    select 1 from public.registrations
    where event_id = v_event.id and lower(email) = v_email
      and public.runner_name_key(first_name, last_name)
          = public.runner_name_key(payload->>'first_name', payload->>'last_name')
      and payment_status is distinct from 'CANCELLED'
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

  -- ── Payment ──
  -- With online payment on, the entry is a reservation until it is paid. An
  -- entry with nothing to pay -- a 100% code -- is confirmed outright: there
  -- is no checkout to send the runner to, since Razorpay refuses a
  -- zero-amount order.
  if coalesce(v_event.online_payment_enabled, false) then
    if greatest(v_category.price - v_discount, 0) <= 0 then
      v_status := 'PAID';
    else
      v_due := now() + make_interval(mins => v_event.payment_hold_minutes);
    end if;
  end if;

  -- No bib here: registrations_assign_bib issues it from the category's
  -- series -- now if the entry holds its place, or when it is paid (0017).
  insert into public.registrations (
    first_name, last_name, email, phone, dob, gender,
    blood_group, emergency_contact_name, emergency_contact_number,
    has_medical_condition, allergies,
    city, state, pincode, club_name,
    category, tshirt_size, estimated_time, coupon_code,
    list_price, discount_amount, price,
    waivers_accepted, waivers_accepted_at,
    event_id, event_name, payment_status,
    payment_due_at, paid_at
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
    v_status,                            -- PENDING unless there is nothing to pay
    v_due,
    case when v_status = 'PAID' then now() end
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
    'payment_due_at', v_row.payment_due_at,
    'event_name',     v_row.event_name
  );
end $$;

revoke all on function public.create_registration(jsonb) from public;
grant execute on function public.create_registration(jsonb) to anon, authenticated;

comment on function public.create_registration(jsonb) is
  'The public solo registration entry point. Validates event, category, capacity, age and consent, refuses a runner (email + name, 0030) who already holds a live entry, prices from event_categories, applies any valid coupon, inserts as PENDING -- a reservation with a payment deadline when online payment is on, PAID outright if nothing is owed. The bib comes from the category series via the registrations trigger (0017). Never trust the client for price or eligibility.';

-- ── 4. Group entry point ────────────────────────────────────────────────────
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
  v_runner_keys  text[] := '{}';   -- email || ' ' || name key, per participant (0030)
  v_dobs         date[] := '{}';

  v_email        text;
  v_name_key     text;
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
  v_results      jsonb := '[]'::jsonb;
  v_row          public.registrations%rowtype;
  v_status       text := 'PENDING';
  v_due          timestamptz;
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

  -- ── Lapsed reservations ──
  -- Release unpaid online reservations whose time ran out before counting
  -- places or checking the email, so an abandoned checkout neither holds a
  -- place nor locks its owner out of trying again.
  perform public.expire_unpaid_holds(v_event.id);

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

    -- Email: may be shared (a parent entering their children). Each runner
    -- still gets their own confirmation, sent to that address. The runner is
    -- the email together with the name (0030).
    v_email := lower(trim(coalesce(v_p->>'email', '')));
    if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'PARTICIPANT_EMAIL_INVALID' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label)::text;
    end if;

    v_name_key := public.runner_name_key(v_p->>'first_name', v_p->>'last_name');

    -- Within the group: the same runner (email and name) twice. Caught here
    -- rather than by the unique index, which would surface as an opaque 23505
    -- naming neither runner. An email holds no spaces, so the key is unambiguous.
    if (v_email || ' ' || v_name_key) = any (v_runner_keys) then
      raise exception 'DUPLICATE_EMAIL_IN_GROUP' using errcode = 'P0001',
        detail = jsonb_build_object('index', v_i, 'name', v_label, 'email', v_email)::text;
    end if;

    -- ...and against everyone already entered for this event, solo or group.
    if exists (
      select 1 from public.registrations
      where event_id = v_event.id and lower(email) = v_email
        and public.runner_name_key(first_name, last_name) = v_name_key
        and payment_status is distinct from 'CANCELLED'
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
    v_runner_keys := v_runner_keys || (v_email || ' ' || v_name_key);
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

  -- ── Payment ──
  -- As in the solo flow: a reservation with a deadline when online payment is
  -- on, confirmed outright when a code has taken the total to zero. Members
  -- carry the group's deadline too, so the read-side place counts
  -- (holds_place) treat them exactly like their group.
  if coalesce(v_event.online_payment_enabled, false) then
    if v_subtotal - v_discount <= 0 then
      v_status := 'PAID';
    else
      v_due := now() + make_interval(mins => v_event.payment_hold_minutes);
    end if;
  end if;

  -- ── Create the group ──
  v_group_code := 'GRP' || lpad(nextval('public.registration_group_seq')::text, 5, '0');

  insert into public.registration_groups (
    group_code, event_id, event_name,
    captain_first_name, captain_last_name, captain_email, captain_phone,
    organisation_name, city, state, pincode,
    emergency_contact_name, emergency_contact_number,
    participant_count, subtotal, discount, total,
    coupon_id, coupon_code,
    waivers_accepted, waivers_accepted_at,
    payment_status, payment_due_at, paid_at
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
    true, now(),
    v_status, v_due, case when v_status = 'PAID' then now() end
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

    -- No bib here either: the registrations trigger issues it (0017).
    insert into public.registrations (
      first_name, last_name, email, phone, dob, gender,
      blood_group, emergency_contact_name, emergency_contact_number,
      has_medical_condition, allergies,
      city, state, pincode, club_name,
      category, tshirt_size, estimated_time, coupon_code,
      list_price, discount_amount, price,
      waivers_accepted, waivers_accepted_at,
      event_id, event_name, payment_status, group_id,
      payment_due_at, paid_at
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
      v_status,
      v_group_id,
      v_due,
      case when v_status = 'PAID' then now() end
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
       and id = (v_results -> (v_first_elig - 1) ->> 'id')::uuid;
  end if;

  return jsonb_build_object(
    'group_id',          v_group_id,
    'group_code',        v_group_code,
    'payment_status',    v_status,
    'payment_due_at',    v_due,
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
  'The public bulk registration entry point. Validates every participant, checks per-category capacity for the whole group at once, prices from event_categories, applies any valid coupon across the group and inserts the group plus all members in one transaction -- as a reservation with a payment deadline when online payment is on. All-or-nothing by design.';

-- ── 5. The details-step check ───────────────────────────────────────────────
-- Answers yes or no and nothing else, like is_email_registered(): it cannot be
-- used to list who has entered. Lapsed reservations do not count, even before
-- the sweeper has cancelled them.
create or replace function public.is_runner_registered(
  p_email text, p_first_name text, p_last_name text, p_event_id text
)
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
      and public.runner_name_key(r.first_name, r.last_name) = public.runner_name_key(p_first_name, p_last_name)
      and public.holds_place(r.payment_status, r.payment_due_at)
  );
$$;

revoke all on function public.is_runner_registered(text, text, text, text) from public;
grant execute on function public.is_runner_registered(text, text, text, text) to anon, authenticated;

comment on function public.is_runner_registered(text, text, text, text) is
  'Does this runner (email + name) already hold a place in this event? Yes/no only. Used by the solo form''s details step; create_registration() enforces the same rule at insert.';

-- ── 6. Admin -> Activity: match the person by name as well ──────────────────
-- The 3-argument version is replaced by one taking the name; the new name
-- arguments default to NULL, so a 3-argument call still resolves.
drop function if exists public._live_entry_email(text, text, text);

-- The email of a live entry (a registration, or a group this person
-- coordinates, that is not cancelled) for this person, matched by email or
-- by phone. NULL when there is none.
--
-- 0030: one email can now hold entries for several runners, so when the
-- logged row carries a name, the entry must be under the same name too.
-- Without a name (rows logged before the name was known) it matches by email
-- or phone alone, as before.
create or replace function public._live_entry_email(
  p_event_id text, p_email text, p_phone text,
  p_first_name text default null, p_last_name text default null
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with k as (select public.runner_name_key(p_first_name, p_last_name) as name)
  select e from k, lateral (
    select lower(r.email) as e, 1 as pref
      from public.registrations r
     where r.event_id = p_event_id
       and (k.name = '' or public.runner_name_key(r.first_name, r.last_name) = k.name)
       and r.payment_status is distinct from 'CANCELLED'
       and (lower(r.email) = lower(p_email)
            or (public._phone10(p_phone) is not null and public._phone10(r.phone) = public._phone10(p_phone)))
    union all
    select lower(g.captain_email), 2
      from public.registration_groups g
     where g.event_id = p_event_id
       and (k.name = '' or public.runner_name_key(g.captain_first_name, g.captain_last_name) = k.name)
       and g.payment_status is distinct from 'CANCELLED'
       and (lower(g.captain_email) = lower(p_email)
            or (public._phone10(p_phone) is not null and public._phone10(g.captain_phone) = public._phone10(p_phone)))
  ) m
  order by (e = lower(p_email)) desc, pref
  limit 1;
$$;

-- Helpers for admin_registration_log(), not for the API.
revoke all on function public._phone10(text) from public, anon, authenticated;
revoke all on function public._live_entry_email(text, text, text, text, text) from public, anon, authenticated;

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
        select public._live_entry_email(l.event_id, l.email, l.phone, l.first_name, l.last_name) as email
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
      select distinct on (lower(email), public.runner_name_key(first_name, last_name)) *
        from logged
       where p_stuck_only and status = 'FAILED' and email is not null and not has_live_entry
       order by lower(email), public.runner_name_key(first_name, last_name), created_at desc
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
           'stuck',      (select count(distinct lower(f.email) || ' ' || public.runner_name_key(f.first_name, f.last_name))
                            from public.registration_log f
                           where f.event_id = p_event_id and f.status = 'FAILED' and f.email is not null
                             and public._live_entry_email(f.event_id, f.email, f.phone, f.first_name, f.last_name) is null)
         )
    into v_summary
    from public.registration_log l
   where l.event_id = p_event_id;

  return jsonb_build_object('total', v_total, 'rows', v_rows, 'summary', v_summary);
end $$;

comment on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) is
  'Admin only. Pages through registration_log for an event, newest first. Each row carries has_live_entry and live_entry_email: the person holds a live entry (same name plus email or phone; email or phone alone when the row has no name, 0030). p_stuck_only: the latest failure of each person (email + name) who still has none. Also returns summary counts.';

revoke all on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) to authenticated;

commit;
