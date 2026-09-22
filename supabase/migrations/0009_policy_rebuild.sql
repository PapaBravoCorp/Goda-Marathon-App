-- 0009_policy_rebuild.sql
--
-- Fixes a hole left by 0006.
--
-- 0006 dropped the permissive policies BY NAME -- the ones migrations 0003 and
-- 0005 had created (`past_events_anon_write`, `faqs_anon_write`,
-- `testimonials_anon_write`). It then added the correct admin-only policies to
-- every content table.
--
-- That was not enough. `events`, `event_categories` and `event_schedule` were
-- carrying their own allow-all policies, created outside these migrations --
-- most likely from the Supabase dashboard's "Enable read and write access for
-- all users" template when the project was first set up. 0006 never named
-- those, so it never dropped them.
--
-- RLS policies are OR-ed together. One surviving `using (true)` policy makes
-- every restrictive policy beside it irrelevant. Verified against the live
-- project after 0006 had been applied: the anon key could still UPDATE
-- public.events, public.event_categories and public.event_schedule, which means
-- entry prices, category status and the registration_open switch were all still
-- editable by anyone holding the key from the JavaScript bundle.
--
-- This migration stops enumerating policies by name. It drops EVERY policy on
-- the tables it manages and rebuilds the intended set, so the end state does
-- not depend on knowing what was there before. It then revokes the write
-- grants from `anon` as a second, independent layer, and finally asserts that
-- nothing anonymous-writable survived.
--
-- Safe to re-run. Run after 0008.

-- ── 1. Tables this migration is authoritative for ───────────────────────────
-- Anything not listed is left alone.
create or replace function public._managed_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'events', 'event_categories', 'event_schedule',
    'past_events', 'past_events_media', 'faqs', 'testimonials',
    'registrations', 'email_log', 'newsletter_subscribers',
    'bib_counters', 'admin_users'
  ]::text[];
$$;

-- ── 2. Drop every existing policy on those tables ───────────────────────────
do $$
declare
  t   text;
  pol record;
  n   integer := 0;
begin
  foreach t in array public._managed_tables() loop
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;  -- table not present on this project; skip rather than fail
    end if;

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
      n := n + 1;
    end loop;

    execute format('alter table public.%I enable row level security', t);
  end loop;

  raise notice 'Dropped % existing policies across the managed tables.', n;
end $$;

-- ── 3. Content: world-readable, admin-writable ──────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'events', 'event_categories', 'event_schedule',
    'past_events', 'past_events_media', 'faqs', 'testimonials'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;

    execute format(
      'create policy %I on public.%I for select using (true)',
      t || '_public_read', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      t || '_admin_insert', t);

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_update', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      t || '_admin_delete', t);
  end loop;
end $$;

-- ── 4. Private tables: admins only ──────────────────────────────────────────
-- registrations holds personal and medical data. The public reaches it only
-- through create_registration(), which runs as the table owner.
create policy registrations_admin_select on public.registrations
  for select to authenticated using (public.is_admin());
create policy registrations_admin_insert on public.registrations
  for insert to authenticated with check (public.is_admin());
create policy registrations_admin_update on public.registrations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy registrations_admin_delete on public.registrations
  for delete to authenticated using (public.is_admin());

create policy email_log_admin_all on public.email_log
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy newsletter_admin_all on public.newsletter_subscribers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy bib_counters_admin_all on public.bib_counters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Read-only even for admins: membership changes only with the service_role key.
create policy admin_users_admin_read on public.admin_users
  for select to authenticated using (public.is_admin());

-- ── 5. Second layer: take the write grants away from anon ───────────────────
-- Independent of RLS. Even if a permissive policy is added by accident later,
-- the anon role has no INSERT, UPDATE or DELETE privilege to exercise.
do $$
declare t text;
begin
  foreach t in array public._managed_tables() loop
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('revoke insert, update, delete, truncate on public.%I from anon', t);
  end loop;
end $$;

-- Public pages still need to read the content tables.
grant select on
  public.events, public.event_categories, public.event_schedule,
  public.past_events, public.past_events_media,
  public.faqs, public.testimonials
to anon;

-- ...and nothing at all on the private ones.
revoke all on public.registrations          from anon;
revoke all on public.email_log              from anon;
revoke all on public.newsletter_subscribers from anon;
revoke all on public.bib_counters           from anon;
revoke all on public.admin_users            from anon;

-- ── 6. Storage: same treatment ──────────────────────────────────────────────
-- 0006 dropped the storage policies by name too, and could have missed one the
-- same way. Rebuild every policy that mentions the past-events bucket.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual like '%past-events%' or with_check like '%past-events%'
           or policyname like 'past_events%')
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy past_events_media_public_read on storage.objects
  for select using (bucket_id = 'past-events');

create policy past_events_media_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'past-events' and public.is_admin());

create policy past_events_media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'past-events' and public.is_admin())
  with check (bucket_id = 'past-events' and public.is_admin());

create policy past_events_media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'past-events' and public.is_admin());

-- ── 7. Assert the result ────────────────────────────────────────────────────
-- 0006 reported success while leaving three tables wide open, because nothing
-- checked. This refuses to finish unless the end state is actually correct.
do $$
declare
  bad      text;
  problems text := '';
begin
  -- 7a. No policy on a managed table may grant anon anything but SELECT.
  --     A policy with no explicit roles applies to PUBLIC, anon included.
  for bad in
    select format('%s.%s (%s)', tablename, policyname, cmd)
    from pg_policies
    where schemaname = 'public'
      and tablename = any (public._managed_tables())
      and cmd <> 'SELECT'
      and (roles = '{public}' or 'anon' = any (roles))
  loop
    problems := problems || E'\n  - ' || bad;
  end loop;

  -- 7b. anon must hold no write privilege on any managed table.
  for bad in
    select format('%s: anon still has %s', table_name, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
      and table_name = any (public._managed_tables())
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  loop
    problems := problems || E'\n  - ' || bad;
  end loop;

  -- 7c. anon must not be able to read the private tables at all.
  for bad in
    select format('%s: anon still has %s', table_name, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
      and table_name in ('registrations', 'email_log', 'newsletter_subscribers',
                         'bib_counters', 'admin_users')
  loop
    problems := problems || E'\n  - ' || bad;
  end loop;

  if problems <> '' then
    raise exception E'Lockdown incomplete. Anonymous access still permitted by:%s', problems;
  end if;

  raise notice 'Verified: no anonymous write path remains on any managed table.';
end $$;

-- ── 8. What this leaves you with ────────────────────────────────────────────
-- Run this any time to see the live policy set:
--
--   select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, cmd, policyname;
--
-- Expected, per content table: one SELECT policy for everyone, plus INSERT,
-- UPDATE and DELETE policies restricted to authenticated admins. Per private
-- table: admin-only, with no anon entry of any kind.
