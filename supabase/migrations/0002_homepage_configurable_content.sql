-- 0002_homepage_configurable_content.sql
--
-- The homepage was entirely hardcoded: an admin could change the event date in
-- Settings and the landing page (countdown included) would keep advertising the
-- old one. These columns give the remaining homepage content a home in the DB
-- so it can be edited from the admin panel.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) BEFORE
-- deploying the matching frontend change.

-- ── Homepage hero copy ──────────────────────────────────────────────────────
-- The factual parts of the hero (date, location, edition) already live on this
-- table. These two cover the promotional line above them.
alter table public.events
  add column if not exists hero_headline text,
  add column if not exists hero_subcopy  text;

comment on column public.events.hero_headline is
  'Homepage hero headline, e.g. "RUN BEYOND LIMITS". Rendered uppercase; the final word is accented automatically. NULL falls back to a built-in default.';
comment on column public.events.hero_subcopy is
  'Supporting paragraph under the hero headline. NULL falls back to the event description.';

-- ── Per-category card content ───────────────────────────────────────────────
-- `perks` is the promotional bullet list on each homepage category card.
-- Stored as jsonb array of strings, e.g. '["Finisher Medal", "Aid stations"]'.
-- jsonb rather than text[] so the admin form can round-trip it as JSON without
-- depending on PostgREST array encoding.
alter table public.event_categories
  add column if not exists perks           jsonb not null default '[]'::jsonb,
  add column if not exists elevation_image text;

comment on column public.event_categories.perks is
  'JSON array of short strings shown as bullets on the homepage category card. Empty array hides the list.';
comment on column public.event_categories.elevation_image is
  'Path or URL of the elevation profile image revealed by the card''s "View Route" toggle. NULL hides the toggle.';

-- Guard against a scalar or object being written where the UI expects an array.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_categories_perks_is_array'
  ) then
    alter table public.event_categories
      add constraint event_categories_perks_is_array
      check (jsonb_typeof(perks) = 'array');
  end if;
end $$;

-- ── Backfill: preserve the copy that was previously hardcoded in Home.jsx ────
-- Matched on distance so it survives renamed categories. Only fills rows that
-- are still at the default, so re-running this never clobbers admin edits.
update public.event_categories set
  perks = '["Beautiful lush trails", "Finisher Medal included", "Aid stations on route"]'::jsonb,
  elevation_image = coalesce(elevation_image, '/images/elevation_5km.png')
where perks = '[]'::jsonb and distance ilike '5%km';

update public.event_categories set
  perks = '["100m total elevation", "Premium Finisher Gear", "G5 Team Support"]'::jsonb,
  elevation_image = coalesce(elevation_image, '/images/elevation_10km.png')
where perks = '[]'::jsonb and distance ilike '10%km';

update public.event_categories set
  perks = '["300m total elevation", "Timing Chip included", "Thrilling descents & climbs"]'::jsonb,
  elevation_image = coalesce(elevation_image, '/images/elevation_15km.png')
where perks = '[]'::jsonb and distance ilike '15%km';
