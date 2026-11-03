-- 0023_runner_lookup.sql
--
-- A read-only runner list for stats viewers (the Runners tab), so the team can
-- look up an entry -- "has Asha paid?", "which bib is the runner whose number
-- ends 3210?" -- without admin access and without seeing full contact details.
--
-- list_registrations_basic(event) returns one row per entry, every status, with
-- only these columns: name, category, individual/group (+ group name), payment
-- status, amount paid, coupon code, Razorpay payment ID, registered at, bib,
-- T-shirt size, city, the phone masked to its last 4 digits and the email
-- masked to its first 2 characters + domain. The masking happens here, in the
-- database, so the full values never leave it. It never returns DOB, emergency
-- contact, blood group or medical details.
--
-- Same gate as the stats: admins and active stats viewers (can_view_stats(),
-- 0022). Viewers still have no access to any table. Nothing existing is
-- modified -- not is_admin(), not admin_users, not any policy, not the
-- registration or payment functions.
--
-- Needs 0022. Rollback: supabase/rollbacks/0023_runner_lookup.down.sql (run it
-- before 0022's rollback). Tests: supabase/tests/0023_runner_lookup.test.sql.
-- Safe to re-run; one transaction.

begin;

-- ── 1. Masking ──────────────────────────────────────────────────────────────
-- Plain functions so the rules are written once and tested directly. Not
-- callable through the API (execute revoked below); only the function in
-- section 2, which runs as the owner, uses them.

-- '+91 98765 43210' -> '******3210'. Digits only, so spaces and +91 do not
-- matter. Fewer than 7 digits is not a real number, and showing 4 of them
-- would show most of it, so those come back fully masked.
create or replace function public.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(regexp_replace(p_phone, '\D', '', 'g'), '') = '' then null
    when length(regexp_replace(p_phone, '\D', '', 'g')) < 7 then '******'
    else '******' || right(regexp_replace(p_phone, '\D', '', 'g'), 4)
  end;
$$;

-- 'asha.k@example.com' -> 'as***@example.com'. Short names keep at least one
-- character hidden: 'ab@x.org' -> 'a***@x.org', 'z@y.in' -> '***@y.in'. The
-- domain is everything after the last '@'. No '@' at all: fully masked.
create or replace function public.mask_email(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when nullif(btrim(p_email), '') is null then null
    when position('@' in btrim(p_email)) = 0 then '***'
    else left(local_part, least(2, greatest(length(local_part) - 1, 0)))
         || '***@' || domain
  end
  from (
    select substring(btrim(p_email) from '^(.*)@[^@]*$') as local_part,
           substring(btrim(p_email) from '@([^@]*)$')    as domain
  ) parts;
$$;

revoke all on function public.mask_phone(text) from public, anon, authenticated;
revoke all on function public.mask_email(text) from public, anon, authenticated;

-- ── 2. The runner list ──────────────────────────────────────────────────────
-- amount_paid is what the runner actually paid, never the category's current
-- price: prices change, and coupons (EARLYBIRD is 18% off) come off at entry.
-- It is empty unless the entry is PAID -- a pending entry has paid nothing
-- yet, and a refunded one no longer has. For a PAID entry:
--
--   * solo, paid through Razorpay: the payment that settled it, from the
--     payment record (payments.amount_paise, fixed when the order was made
--     from the entry's price after the coupon), less any partial refund.
--   * group member: the group paid once, so the payment record holds the
--     group's total. Each member shows their own share of it -- their price
--     after their share of the coupon, apportioned at entry (0010/0011); the
--     shares add up to the group total that was charged.
--   * paid any other way (marked paid by an admin, free entries): the entry's
--     own price after the coupon, frozen when they registered.
--
-- razorpay_payment_id is registrations.payment_ref, which 0011 sets to the
-- Razorpay payment (pay_...) for solo entries and for every group member.

create or replace function public.list_registrations_basic(p_event_id text)
returns table (
  name                text,
  category            text,
  entry_type          text,
  group_name          text,
  payment_status      text,
  amount_paid         numeric,
  coupon_code         text,
  razorpay_payment_id text,
  registered_at       timestamptz,
  bib                 text,
  tshirt_size         text,
  city                text,
  phone_masked        text,
  email_masked        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_view_stats() then
    raise exception 'You do not have access to the runner list.'
      using errcode = '42501';  -- insufficient_privilege: PostgREST answers 403
  end if;

  -- Every column is qualified: the output names above are variables inside
  -- this function and would otherwise shadow the table's columns.
  return query
  select
    nullif(btrim(concat_ws(' ', btrim(r.first_name), btrim(r.last_name))), '')::text,
    r.category::text,
    case when r.group_id is null then 'Individual' else 'Group' end::text,
    case when r.group_id is null then null
         else coalesce(nullif(btrim(g.organisation_name), ''), g.group_code) end::text,
    r.payment_status::text,
    case when r.payment_status = 'PAID'
         then coalesce(round(pay.kept_paise / 100.0, 2), r.price) end::numeric,
    r.coupon_code::text,
    r.payment_ref::text,
    r.created_at,
    r.bib::text,
    r.tshirt_size::text,
    r.city::text,
    public.mask_phone(r.phone),
    public.mask_email(r.email)
  from public.registrations r
  left join public.registration_groups g on g.id = r.group_id
  -- The Razorpay payment that settled this entry on its own. A group's
  -- payment row has no registration_id, so members never match it.
  left join lateral (
    select p.amount_paise - p.refunded_paise as kept_paise
      from public.payments p
     where p.registration_id = r.id
       and p.razorpay_payment_id = r.payment_ref
       and p.status = 'PAID'
  ) pay on true
  where r.event_id = p_event_id
  order by r.created_at desc;
end;
$$;

comment on function public.list_registrations_basic(text) is
  'Read-only runner list for one event, for admins and active stats viewers. Phone masked to its last 4 digits and email to 2 characters + domain, in the database. Never returns DOB, emergency contact, blood group or medical details.';

revoke all on function public.list_registrations_basic(text) from public, anon;
grant execute on function public.list_registrations_basic(text) to authenticated;

commit;
