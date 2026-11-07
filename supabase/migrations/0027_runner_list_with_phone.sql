-- 0027_runner_list_with_phone.sql
--
-- Run after 0026. The Runners tab (stats viewers) shows full phone numbers,
-- and says when a cancelled attempt belongs to someone who paid in another
-- entry.
--
-- Why:
--   * The organisers on the stats-viewer login phone runners -- to chase an
--     unfinished payment, to confirm an entry -- and 0023 gave them only the
--     last four digits. Decided 7 Nov 2026: viewers see the full number.
--     Email stays masked; DOB, emergency contact, blood group and medical
--     details are still never returned.
--   * A runner whose first checkout lapsed and who paid on a second attempt
--     appears twice: CANCELLED and PAID. Read alone, the CANCELLED row looks
--     like "paid but not registered" and the organisers were chasing people
--     who were in all along. paid_entry names the paid entry ("5Km Goda
--     Yatra · bib 5005"), matched by phone (last ten digits) or email.
--
-- A new function, list_runners(), rather than a change to 0023's
-- list_registrations_basic(): a different return type cannot be swapped in
-- with CREATE OR REPLACE, and the masked function keeps working for a build
-- that predates this one. The Runners tab falls back to it while this
-- migration is not applied.
--
-- Rollback: supabase/rollbacks/0027_runner_list_with_phone.down.sql.
-- Tests: supabase/tests/0027_runner_list_with_phone.test.sql.
--
-- Safe to re-run. One transaction.

begin;

create or replace function public.list_runners(p_event_id text)
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
  phone               text,
  email_masked        text,
  paid_entry          text
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
  with entries as (
    select r.*,
           case when length(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g')) >= 10
                then right(regexp_replace(r.phone, '\D', '', 'g'), 10) end as phone10
      from public.registrations r
     where r.event_id = p_event_id
  )
  select
    nullif(btrim(concat_ws(' ', btrim(e.first_name), btrim(e.last_name))), '')::text,
    e.category::text,
    case when e.group_id is null then 'Individual' else 'Group' end::text,
    case when e.group_id is null then null
         else coalesce(nullif(btrim(g.organisation_name), ''), g.group_code) end::text,
    e.payment_status::text,
    case when e.payment_status = 'PAID'
         then coalesce(round(pay.kept_paise / 100.0, 2), e.price) end::numeric,
    e.coupon_code::text,
    e.payment_ref::text,
    e.created_at,
    e.bib::text,
    e.tshirt_size::text,
    e.city::text,
    nullif(btrim(e.phone), '')::text,
    public.mask_email(e.email),
    paid.label::text
  from entries e
  left join public.registration_groups g on g.id = e.group_id
  -- The Razorpay payment that settled this entry on its own. A group's
  -- payment row has no registration_id, so members never match it.
  left join lateral (
    select p.amount_paise - p.refunded_paise as kept_paise
      from public.payments p
     where p.registration_id = e.id
       and p.razorpay_payment_id = e.payment_ref
       and p.status = 'PAID'
  ) pay on true
  -- For an entry that is not paid: the same person's paid entry, if any.
  left join lateral (
    select concat_ws(' · ', o.category, 'bib ' || o.bib) as label
      from entries o
     where e.payment_status is distinct from 'PAID'
       and o.id <> e.id
       and o.payment_status = 'PAID'
       and ((e.phone10 is not null and o.phone10 = e.phone10)
            or lower(btrim(o.email)) = lower(btrim(e.email)))
     order by o.created_at
     limit 1
  ) paid on true
  order by e.created_at desc;
end;
$$;

comment on function public.list_runners(text) is
  'Runner list for one event, for admins and active stats viewers: full phone (decided 7 Nov 2026), email masked to 2 characters + domain, and paid_entry naming the same person''s paid entry on rows that are not paid. Never returns DOB, emergency contact, blood group or medical details.';

-- Supabase grants EXECUTE on new functions to anon by default.
revoke all on function public.list_runners(text) from public, anon;
grant execute on function public.list_runners(text) to authenticated;

commit;
