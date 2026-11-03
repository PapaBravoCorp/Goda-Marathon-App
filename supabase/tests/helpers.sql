-- Shared setup for the *.test.sql files (included with \ir, not run on its own).
-- cleanup.sql undoes it at the end of each file.
--
-- test.ok(cond, label)  raises 'FAIL - label' unless cond is true
-- test.act_as(uid)      act as that user for the rest of the transaction, the
--                       way PostgREST does (null = not signed in). Pair it with
--                       SET LOCAL ROLE anon | authenticated.
--
-- People
--   …0a admin           in admin_users
--   …0b viewer          active stats viewer
--   …0c former viewer   stats viewer with active = false
--   …0d stranger        a confirmed Supabase account with no role at all

create schema if not exists test;

create or replace function test.ok(passed boolean, label text)
returns void
language plpgsql
as $$
begin
  if passed is distinct from true then
    raise exception 'FAIL - %', label;
  end if;
  raise notice 'ok - %', label;
end $$;

create or replace function test.act_as(p_user uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    case when p_user is null then '{"role":"anon"}'
         else json_build_object('sub', p_user, 'role', 'authenticated')::text end,
    true
  );
$$;

grant usage on schema test to anon, authenticated;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'viewer@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'former@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@test.local');

insert into public.admin_users (user_id, email, note)
values ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', 'test admin');

insert into public.stats_viewers (user_id, name, active) values
  ('00000000-0000-0000-0000-00000000000b', 'Viewer', true),
  ('00000000-0000-0000-0000-00000000000c', 'Former viewer', false);
