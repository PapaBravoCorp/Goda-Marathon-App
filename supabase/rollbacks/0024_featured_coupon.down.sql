-- Rollback for 0024_featured_coupon.sql.
--
-- Removes the featured code from events. No coupon, registration or payment
-- is touched: entries already discounted keep their discount, and the code
-- still works when typed. Deploy the previous frontend first, or simply leave
-- the column in place -- the older frontend ignores it.

begin;

alter table public.events
  drop constraint if exists events_featured_coupon_code_check;

alter table public.events
  drop column if exists featured_coupon_code;

commit;
