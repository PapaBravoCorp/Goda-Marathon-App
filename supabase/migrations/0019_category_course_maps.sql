-- 0019_category_course_maps.sql
--
-- A course map for each race category, replacing the "Interactive Route Map
-- (Coming Soon)" box on the event page.
--
-- Admin -> Categories takes a GPX file of the course. The browser trims it to
-- a compact copy and uploads that to the past-events bucket under courses/;
-- the category row keeps its public URL. The event page draws the course on
-- a map with its elevation profile and offers the same file to download for
-- a watch.
--
--   1. event_categories.route_gpx: the file's URL. NULL shows no map.
--   2. The past-events bucket accepts application/gpx+xml. It only takes the
--      types it lists, and until now that was images and MP4.
--
-- Can run before or after the matching frontend deploy: the admin panel only
-- sends route_gpx when a course is uploaded or removed, and the event page
-- keeps the placeholder while no category has one. Uploading a course fails,
-- with a message naming this file, until it has run. Safe to re-run. Run
-- after 0018.

-- ── 1. The course file per category ─────────────────────────────────────────
alter table public.event_categories
  add column if not exists route_gpx text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_categories_route_gpx_url_check'
  ) then
    alter table public.event_categories
      add constraint event_categories_route_gpx_url_check
      check (route_gpx is null or route_gpx ~* '^(https?://|/)\S+$');
  end if;
end $$;

comment on column public.event_categories.route_gpx is
  'Public URL of the category''s course as a GPX file, uploaded from Admin -> Categories to the past-events bucket under courses/. Drawn as the course map on the event page and offered there as a download. NULL shows no map for this category.';

-- Content tables are readable by anon and writable by admins at table level
-- (0006, 0009), so the new column needs no grant or policy of its own.

-- ── 2. Let the media bucket take GPX files ──────────────────────────────────
-- Appended rather than set, so a type added to the bucket by hand is kept. A
-- NULL list already allows every type and is left alone. 0003 sets the list
-- wholesale: if it is ever re-run, run this file again afterwards.
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'application/gpx+xml')
 where id = 'past-events'
   and allowed_mime_types is not null
   and not ('application/gpx+xml' = any (allowed_mime_types));

-- ── Assert the result ───────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_categories'
      and column_name = 'route_gpx'
  ) then
    raise exception '0019: event_categories.route_gpx was not created';
  end if;

  if not exists (select 1 from storage.buckets where id = 'past-events') then
    raise exception '0019: the past-events bucket does not exist. Run 0003_past_events.sql first.';
  end if;

  if exists (
    select 1 from storage.buckets
    where id = 'past-events'
      and allowed_mime_types is not null
      and not ('application/gpx+xml' = any (allowed_mime_types))
  ) then
    raise exception '0019: the past-events bucket still refuses GPX files';
  end if;
end $$;
