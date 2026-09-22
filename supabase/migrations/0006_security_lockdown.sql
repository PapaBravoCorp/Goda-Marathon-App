-- 0006_security_lockdown.sql
--
-- CRITICAL. Run this before the site is public.
--
-- Every table in this schema was readable and writable by the anon key, and the
-- anon key ships inside the JavaScript bundle where anyone can read it. That is
-- how Supabase is meant to work -- the key is public by design and Row Level
-- Security is what actually protects the data. Until now there was none worth
-- the name: 0003 and 0005 created `..._anon_write` policies with `using (true)`,
-- and the older tables had RLS left off entirely.
--
-- Demonstrated against the live project with nothing but the public key:
--   * read all of public.registrations -- names, emails, dates of birth, phone
--     numbers, blood groups, emergency contacts, medical notes, addresses
--   * UPDATE and DELETE rows in public.registrations
--   * UPDATE public.faqs and public.events
--
-- This migration closes all of that. Afterwards:
--   * content tables are world-READABLE and admin-writable
--   * registrations are admin-only; the public writes them through the
--     create_registration() function added in 0007, never directly
--   * email_log is admin-only in both directions
--   * the past-events storage bucket stays publicly readable but only admins
--     can upload or delete
--
-- Admin identity comes from Supabase Auth. Section 1 sets that up; section 8
-- tells you how to create the first admin account.
--
-- Safe to re-run.
--
-- INCOMPLETE ON ITS OWN -- 0009_policy_rebuild.sql fixes it.
-- This file drops the old permissive policies BY NAME, which only catches the
-- ones migrations 0003 and 0005 created. Tables carrying allow-all policies
-- from elsewhere (the Supabase dashboard's "enable access for all users"
-- template, in this project's case events, event_categories and
-- event_schedule) kept them, and because RLS policies are OR-ed together, one
-- surviving `using (true)` defeats every restrictive policy beside it.
-- 0009 drops every policy on the managed tables and rebuilds them, then
-- asserts the result. Always run 0009 after this file.

-- ── 1. Who is an admin ──────────────────────────────────────────────────────
-- A row here grants dashboard access to that Supabase Auth user. Membership is
-- deliberately NOT self-service: only an existing admin, or someone with the
-- service_role key in the Supabase dashboard, can add one.

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Allow-list of Supabase Auth users who may administer the site. Referenced by public.is_admin(), which every admin RLS policy is built on.';

-- SECURITY DEFINER so the check itself is not subject to RLS on admin_users --
-- otherwise the policy would have to read a table the caller cannot see, and
-- every admin policy would silently evaluate to false.
--
-- search_path is pinned: a SECURITY DEFINER function that resolves names
-- through the caller's search_path can be tricked into running their code.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

comment on function public.is_admin() is
  'True when the caller is signed in as an allow-listed admin. The single source of truth for every admin RLS policy.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admin_users enable row level security;

-- Admins can see the list (so the dashboard can show who has access).
-- Nobody can write it through the API at all -- no insert/update/delete policy
-- exists, so membership can only be changed with the service_role key.
drop policy if exists admin_users_admin_read on public.admin_users;
create policy admin_users_admin_read on public.admin_users
  for select to authenticated using (public.is_admin());

-- ── 2. Drop the permissive policies left by earlier migrations ──────────────
drop policy if exists past_events_anon_write   on public.past_events;
drop policy if exists past_events_public_read  on public.past_events;
drop policy if exists faqs_anon_write          on public.faqs;
drop policy if exists faqs_public_read         on public.faqs;
drop policy if exists testimonials_anon_write  on public.testimonials;
drop policy if exists testimonials_public_read on public.testimonials;

-- ── 3. Content tables: public read, admin write ─────────────────────────────
-- These drive the public site, so anonymous visitors must be able to SELECT
-- them. Nothing here is personal data.

do $$
declare
  t text;
begin
  foreach t in array array[
    'events',
    'event_categories',
    'event_schedule',
    'past_events',
    'past_events_media',
    'faqs',
    'testimonials'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    -- Read: everyone, signed in or not.
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format(
      'create policy %I on public.%I for select using (true)',
      t || '_public_read', t
    );

    -- Write: admins only. Split per verb rather than FOR ALL so that a future
    -- change to one of them cannot silently widen the others.
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      t || '_admin_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      t || '_admin_delete', t
    );
  end loop;
end $$;

-- ── 4. Registrations: admin only ────────────────────────────────────────────
-- Deliberately NO policy for anon. The public registration form does not touch
-- this table directly any more; it calls public.create_registration(), added in
-- 0007, which runs as its own owner and validates the entry before inserting.
--
-- The effect is that a leaked anon key can no longer read, alter or destroy a
-- single participant record.

-- ENABLE, deliberately not FORCE. FORCE ROW LEVEL SECURITY would apply these
-- policies to the table OWNER as well -- and the owner is exactly what the
-- SECURITY DEFINER functions in 0007 and 0008 run as. Under FORCE,
-- create_registration() would be matched against a policy written `to
-- authenticated`, find nothing that applies to it, and every public
-- registration would be refused.
alter table public.registrations enable row level security;

drop policy if exists registrations_public_read   on public.registrations;
drop policy if exists registrations_anon_write    on public.registrations;
drop policy if exists registrations_admin_all     on public.registrations;
drop policy if exists registrations_admin_select  on public.registrations;
drop policy if exists registrations_admin_insert  on public.registrations;
drop policy if exists registrations_admin_update  on public.registrations;
drop policy if exists registrations_admin_delete  on public.registrations;

create policy registrations_admin_select on public.registrations
  for select to authenticated using (public.is_admin());

create policy registrations_admin_insert on public.registrations
  for insert to authenticated with check (public.is_admin());

create policy registrations_admin_update on public.registrations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy registrations_admin_delete on public.registrations
  for delete to authenticated using (public.is_admin());

comment on table public.registrations is
  'Participant entries. Contains personal and medical data: never expose this table to the anon role. Public writes go through public.create_registration(); public reads of finish times go through public.get_published_results().';

-- ── 5. Email log: admin only, both directions ───────────────────────────────
-- Subjects and bodies of mail sent to participants are not public information.

create table if not exists public.email_log (
  id              uuid primary key default gen_random_uuid(),
  subject         text,
  body            text,
  recipient_count integer,
  filter_criteria jsonb,
  status          text,
  error_message   text,
  sent_by         text,
  sent_at         timestamptz not null default now()
);

alter table public.email_log enable row level security;

drop policy if exists email_log_public_read on public.email_log;
drop policy if exists email_log_anon_write  on public.email_log;
drop policy if exists email_log_admin_all   on public.email_log;

create policy email_log_admin_all on public.email_log
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 6. Storage: public read, admin write ────────────────────────────────────
-- The bucket stays public so <img> tags work without signed URLs, but the
-- previous policies let anyone with the anon key upload into it, or delete the
-- entire past-events gallery.

do $$
begin
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='past_events_media_anon_insert') then
    drop policy past_events_media_anon_insert on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='past_events_media_anon_delete') then
    drop policy past_events_media_anon_delete on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='past_events_media_public_read') then
    drop policy past_events_media_public_read on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='past_events_media_admin_insert') then
    drop policy past_events_media_admin_insert on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='past_events_media_admin_update') then
    drop policy past_events_media_admin_update on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='past_events_media_admin_delete') then
    drop policy past_events_media_admin_delete on storage.objects;
  end if;
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

-- ── 7. Revoke blanket table grants from the public roles ────────────────────
-- Supabase grants anon/authenticated broad table privileges by default and
-- relies on RLS to narrow them. Belt and braces: take away what they should
-- never have had, so a future table created without RLS is not instantly
-- world-writable.

revoke all on public.registrations from anon;
revoke all on public.email_log     from anon;
grant select on public.events, public.event_categories, public.event_schedule,
                public.past_events, public.past_events_media,
                public.faqs, public.testimonials to anon;

-- ── 8. Creating the first admin ─────────────────────────────────────────────
-- 1. Supabase dashboard -> Authentication -> Users -> "Add user".
--    Use a real address and a strong password. Tick "Auto Confirm User".
-- 2. Copy the new user's UUID.
-- 3. Run, in the SQL editor (which uses service_role, so it bypasses RLS):
--
--      insert into public.admin_users (user_id, email, note)
--      values ('<paste-uuid-here>', 'you@example.com', 'primary admin');
--
-- 4. Sign in at /admin with that email and password.
--
-- Turn OFF public sign-ups while you are in Authentication settings
-- (Providers -> Email -> "Enable sign ups"). Nothing in this app needs them,
-- and leaving them on lets strangers create accounts on your project.

do $$
declare n integer;
begin
  select count(*) into n from public.admin_users;
  if n = 0 then
    raise notice
      'admin_users is empty -- nobody can administer the site yet. Follow step 8 at the bottom of 0006_security_lockdown.sql to create the first admin.';
  end if;
end $$;
