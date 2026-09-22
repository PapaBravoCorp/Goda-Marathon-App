-- 0003_past_events.sql
--
-- Past Events was almost entirely hardcoded: the year, title, finisher count,
-- location, date and description lived in a STATIC_EVENTS array in
-- src/pages/PastEvents.jsx, and past_events_media carried only a denormalised
-- event_title on each media row. An admin could add photos but could not
-- describe the event those photos belonged to.
--
-- This adds a real past_events table, plus a public Storage bucket so photos
-- can be uploaded from the admin panel instead of hotlinked.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ── 1. Past events ──────────────────────────────────────────────────────────
create table if not exists public.past_events (
  id            uuid primary key default gen_random_uuid(),
  year          text not null unique,
  title         text not null,
  event_date    text,
  location      text,
  participants  text,
  description   text,
  cover_image   text,
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.past_events is
  'One row per past edition. Drives the year pills and the stats band on /past-events.';
comment on column public.past_events.year is
  'Display year, e.g. "2025". Joins to past_events_media.event_year.';
comment on column public.past_events.event_date is
  'Free text as shown to visitors, e.g. "October 5, 2025" — not a date type, because past editions are often remembered loosely.';
comment on column public.past_events.participants is
  'Display string, e.g. "1000+". Text on purpose: "1000+" is not a number.';
comment on column public.past_events.is_published is
  'Unpublished editions stay hidden from the public page but remain editable in admin.';

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists past_events_touch_updated_at on public.past_events;
create trigger past_events_touch_updated_at
  before update on public.past_events
  for each row execute function public.touch_updated_at();

-- ── 2. Seed / backfill ──────────────────────────────────────────────────────
-- Preserve the content that was previously hardcoded in STATIC_EVENTS so the
-- page keeps saying the same thing after this migration.
insert into public.past_events (year, title, event_date, location, participants, description, display_order)
values (
  '2025',
  'Goda Epic Trail - 2nd Edition',
  'October 5, 2025',
  'Gangapur Backwaters, Nagalwadi, Girnare',
  '1000+',
  'An epic trail run experience that connected runners with nature through lush trails and rolling hills.',
  0
)
on conflict (year) do nothing;

-- Any year already referenced by media but missing an event row gets a stub,
-- so no existing photo is orphaned behind a year pill that has no metadata.
insert into public.past_events (year, title, display_order)
select distinct m.event_year,
       coalesce(m.event_title, 'GODA Marathon ' || m.event_year),
       0
from public.past_events_media m
where m.event_year is not null
on conflict (year) do nothing;

-- ── 3. Row level security ───────────────────────────────────────────────────
-- Mirrors the permissive model the rest of this schema already uses: the admin
-- panel writes with the anon key. See the [AUTH]/[RLS] TODOs in
-- src/utils/services/*.js — locking these down belongs with real admin auth.
alter table public.past_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='past_events' and policyname='past_events_public_read') then
    create policy past_events_public_read on public.past_events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='past_events' and policyname='past_events_anon_write') then
    create policy past_events_anon_write on public.past_events for all using (true) with check (true);
  end if;
end $$;

-- ── 4. Storage bucket for uploaded photos ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'past-events',
  'past-events',
  true,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='objects' and policyname='past_events_media_public_read') then
    create policy past_events_media_public_read on storage.objects
      for select using (bucket_id = 'past-events');
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and policyname='past_events_media_anon_insert') then
    create policy past_events_media_anon_insert on storage.objects
      for insert with check (bucket_id = 'past-events');
  end if;
  if not exists (select 1 from pg_policies where tablename='objects' and policyname='past_events_media_anon_delete') then
    create policy past_events_media_anon_delete on storage.objects
      for delete using (bucket_id = 'past-events');
  end if;
end $$;

-- ── 5. Media table: track where a file came from ────────────────────────────
-- storage_path is set for uploads so the file can be removed from the bucket
-- when its row is deleted; NULL means the row points at an external URL.
alter table public.past_events_media
  add column if not exists storage_path text;

comment on column public.past_events_media.storage_path is
  'Object path inside the past-events bucket for uploaded files. NULL for externally hosted URLs (Google Drive, YouTube, etc).';

create index if not exists past_events_media_year_order_idx
  on public.past_events_media (event_year, display_order);
