-- Rollback for 0025_registration_log.sql
--
-- Removes the registration activity log and its functions (0026's included). The forms keep
-- working: logging fails quietly when log_registration_event() is missing, and
-- Admin -> Activity says the log is not set up. The logged rows are lost.
--
-- If the migration was applied with `supabase db push`, also mark it reverted:
--   npm run supabase -- migration repair --status reverted 0025

begin;

drop function if exists public.admin_registration_log(text, text, text, text, boolean, integer, integer);
drop function if exists public.log_registration_event(jsonb);
drop function if exists public._live_entry_email(text, text, text);
drop function if exists public._phone10(text);
drop table if exists public.registration_log;

commit;
