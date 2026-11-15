-- 0024_featured_coupon.sql
--
-- One discount code per event can be shown on the site. The registration form
-- applies it for the runner, and the category cards show the price with it
-- next to the list price struck through.
--
-- Why a column on events and not a flag on coupons: public.coupons is not
-- readable by anon (0010), so that codes meant for one club stay private.
-- events is world-readable. Putting the one code the organisers chose to
-- advertise here publishes that code and no other; there is still no endpoint
-- that lists coupons.
--
-- The site never trusts this value for a price. It asks preview_coupon() what
-- the code is worth, the same as for a typed code, and shows nothing when the
-- code is inactive, expired, used up or deleted. So a stale value here costs
-- nothing, and no trigger is needed to keep it in step with the coupons table.
--
-- Nothing existing is modified: no policy, no grant, no function. The table
-- grant and policies on events (0009) cover the new column: everyone reads,
-- only an admin updates.
--
-- Run BEFORE deploying the matching frontend. Until it runs, the site behaves
-- as before and Admin -> Coupons -> "Show on site" reports that this file is
-- needed. Rollback: supabase/rollbacks/0024_featured_coupon.down.sql.
-- Safe to re-run.

begin;

alter table public.events
  add column if not exists featured_coupon_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_featured_coupon_code_check') then
    alter table public.events
      add constraint events_featured_coupon_code_check
      -- The shape the admin form allows for a code (CouponManager.jsx).
      check (featured_coupon_code is null or featured_coupon_code ~ '^[A-Z0-9_-]{3,24}$');
  end if;
end $$;

comment on column public.events.featured_coupon_code is
  'The discount code advertised on the site: applied automatically on the registration form and priced on the category cards. NULL shows none. Public by design, unlike the coupons table. Priced through preview_coupon(), so an inactive or expired code simply stops showing.';

commit;
