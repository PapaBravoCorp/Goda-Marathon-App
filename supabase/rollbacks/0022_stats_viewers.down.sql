-- Rollback for 0022_stats_viewers.sql
--
-- Removes the stats viewer feature completely: both functions and the
-- stats_viewers table (and with it the list of who had access -- copy it first
-- if you want a record: select * from public.stats_viewers;).
--
-- Touches nothing else. The viewers' Supabase Auth accounts stay; delete them
-- under Authentication -> Users if they should go too. Once this has run, the
-- Stats page tells viewers they have no access, and admins keep every other tab.
--
-- If the migration was applied with `supabase db push`, also mark it reverted
-- so a later push re-applies it:
--   npm run supabase -- migration repair --status reverted 0022
--
-- Kept outside supabase/migrations on purpose: anything in that folder is
-- applied by `db push`.

begin;

drop function if exists public.get_reg_stats(text);
drop function if exists public.can_view_stats();
drop table if exists public.stats_viewers;

commit;
