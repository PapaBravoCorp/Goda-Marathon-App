-- Rollback for 0027_runner_list_with_phone.sql
--
-- Removes list_runners(). The Runners tab falls back to 0023's
-- list_registrations_basic(), with phones masked to their last 4 digits
-- again. Touches nothing else.
--
-- If the migration was applied with `supabase db push`, also mark it reverted:
--   npm run supabase -- migration repair --status reverted 0027

begin;

drop function if exists public.list_runners(text);

commit;
