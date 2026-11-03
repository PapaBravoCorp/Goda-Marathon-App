-- Rollback for 0023_runner_lookup.sql
--
-- Removes the runner list function and its two masking helpers. Touches
-- nothing else: the stats (0022) keep working, and the Runners tab tells
-- viewers it is not available. Run this BEFORE 0022's rollback if you are
-- removing both.
--
-- If the migration was applied with `supabase db push`, also mark it reverted:
--   npm run supabase -- migration repair --status reverted 0023

begin;

drop function if exists public.list_registrations_basic(text);
drop function if exists public.mask_email(text);
drop function if exists public.mask_phone(text);

commit;
