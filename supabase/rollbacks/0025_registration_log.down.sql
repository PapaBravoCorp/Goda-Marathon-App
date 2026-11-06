-- Rollback for 0025_registration_log.sql
--
-- Removes the registration activity log and its two functions. The forms keep
-- working: logging fails quietly when log_registration_event() is missing, and
-- Admin -> Activity says the log is not set up. The logged rows are lost.
--
-- If the migration was applied with `supabase db push`, also mark it reverted:
--   npm run supabase -- migration repair --status reverted 0025

begin;

drop function if exists public.admin_registration_log(text, text, text, text, boolean, integer, integer);
drop function if exists public.log_registration_event(jsonb);
drop table if exists public.registration_log;

commit;
