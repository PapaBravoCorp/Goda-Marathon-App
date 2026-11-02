-- Stand-ins for the parts of a Supabase project that the migrations assume but
-- never create, so the real migration files can be applied, in order, to a
-- throwaway local PostgreSQL. Used by run-db-tests.sh. Never run this against
-- the live project.
--
-- What is faked, and how closely:
--   * Roles anon / authenticated / service_role, with Supabase's default
--     privileges (new tables AND functions are granted to anon and
--     authenticated explicitly). That default is what makes a
--     "revoke ... from public" on its own insufficient, so tests catch it.
--   * auth.uid() with Supabase's own definition: it reads the JWT claims that
--     PostgREST puts in request.jwt.claims. Tests set that setting to act as a
--     user, exactly as the API does.
--   * auth.users, storage.buckets, storage.objects: only the columns used.
--   * The tables that were created in the dashboard before the migrations
--     existed (events, event_categories, event_schedule, past_events_media,
--     registrations): only the base columns. The migrations add the rest.
--
-- pg_net and pg_cron are not installed locally; 0011 and 0014 skip them when
-- they are unavailable, which is the behaviour they document.

-- ── Roles ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema if not exists extensions;

-- ── auth ────────────────────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id         uuid primary key,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

-- ── storage ─────────────────────────────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;

-- ── Tables created in the dashboard before migration 0001 ───────────────────
create table if not exists public.events (
  id                text primary key,
  name              text not null,
  date              date,
  location          text,
  description       text,
  registration_open boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists public.event_categories (
  id         uuid primary key default gen_random_uuid(),
  event_id   text references public.events (id) on delete cascade,
  name       text not null,
  distance   text,
  price      numeric(10, 2) not null default 0,
  max_slots  integer,
  status     text default 'Open',
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.event_schedule (
  id          uuid primary key default gen_random_uuid(),
  event_id    text references public.events (id) on delete cascade,
  time        text,
  title       text,
  description text,
  display_order integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.past_events_media (
  id            uuid primary key default gen_random_uuid(),
  event_year    text,
  event_title   text,
  media_type    text,
  url           text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.registrations (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  first_name     text not null,
  last_name      text,
  email          text not null,
  dob            date,
  gender         text,
  category       text,
  tshirt_size    text,
  estimated_time text,
  price          numeric(10, 2),
  event_id       text,
  event_name     text,
  bib            text,
  payment_status text not null default 'PENDING'
);
