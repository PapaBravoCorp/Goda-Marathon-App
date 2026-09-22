-- 0004_multiple_editions_per_year.sql
--
-- 0003 assumed one edition per calendar year and enforced it with a UNIQUE
-- constraint on past_events.year. That is wrong: GODA ran two editions in 2025.
--
-- Dropping the constraint alone is not enough. past_events_media joined to an
-- edition by the YEAR STRING (event_year), so two editions sharing a year would
-- also share a single pool of photos. This migration moves that relationship
-- onto a real foreign key, which is what it should have been from the start.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ── 1. Allow more than one edition per year ─────────────────────────────────
alter table public.past_events
  drop constraint if exists past_events_year_key;

-- ── 2. Optional short label to tell same-year editions apart ────────────────
alter table public.past_events
  add column if not exists edition_label text;

comment on column public.past_events.edition_label is
  'Short disambiguator shown beside the year when several editions share it, e.g. "Spring" or "2nd". Optional when a year has only one edition.';

-- ── 3. Real foreign key from media to edition ───────────────────────────────
alter table public.past_events_media
  add column if not exists past_event_id uuid
  references public.past_events(id) on delete cascade;

comment on column public.past_events_media.past_event_id is
  'Owning edition. Replaces the old join on event_year, which could not distinguish two editions in the same year. ON DELETE CASCADE: removing an edition removes its gallery rows.';

comment on column public.past_events_media.event_year is
  'Denormalised display copy of the owning edition''s year. Kept in sync by the admin panel; past_event_id is the authoritative link.';

-- ── 4. Backfill the new link from the existing year values ──────────────────
-- Unambiguous today, because the UNIQUE constraint we just dropped guaranteed
-- at most one edition per year up to this point.
update public.past_events_media m
set past_event_id = e.id
from public.past_events e
where m.past_event_id is null
  and m.event_year = e.year;

-- ── 5. Index the new access path ────────────────────────────────────────────
create index if not exists past_events_media_event_order_idx
  on public.past_events_media (past_event_id, display_order);

-- ── 6. Report anything the backfill could not place ─────────────────────────
-- Media whose event_year matches no edition stays unlinked and will not appear
-- on the site. Nothing is deleted; this only tells you if there is any.
do $$
declare orphaned integer;
begin
  select count(*) into orphaned
  from public.past_events_media
  where past_event_id is null;

  if orphaned > 0 then
    raise notice
      'past_events_media: % row(s) could not be linked to an edition and will not display. Check their event_year values.',
      orphaned;
  end if;
end $$;
