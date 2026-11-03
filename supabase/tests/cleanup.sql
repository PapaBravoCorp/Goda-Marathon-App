-- Undoes helpers.sql (included with \ir at the end of each *.test.sql), so the
-- next file starts from the database as the migrations left it.
delete from public.stats_viewers;
delete from public.admin_users;
delete from auth.users;
drop schema test cascade;
