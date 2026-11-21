-- 0025_category_badge.sql
--
-- What the badge in the top-right corner of each homepage category card says,
-- chosen in Admin -> Website -> Category cards:
--
--   status  "Open" (or Sold Out / Closed). No count. The default.
--   count   the live number of places left, e.g. "195 slots left".
--   custom  the admin's own words, e.g. "Few slots left" or "Filling fast".
--
-- Why: the cards used to always show the live count. With a cap of 200 and
-- few entries yet, the number barely moved for weeks, and runners read it as
-- "nobody is signing up". The organisers asked for the count to come off.
--
-- In every mode a category with 10 or fewer places left still shows its real
-- count in orange, the same rule the registration page already follows. That
-- figure is true and is the one worth showing.
--
-- The frontend treats a missing column as 'status', so deploying it before
-- this file runs already hides the count; this file only adds the choice.
-- Additive: nothing existing is modified. The table's policies and grants
-- (0018) cover new columns: everyone reads, only an admin updates.
--
-- Safe to re-run. Run after 0024.
-- Rollback: supabase/rollbacks/0025_category_badge.down.sql.

begin;

alter table public.site_settings
  add column if not exists category_badge      text not null default 'status',
  add column if not exists category_badge_text text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_settings_category_badge_check') then
    alter table public.site_settings
      add constraint site_settings_category_badge_check
      check (category_badge in ('status', 'count', 'custom'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'site_settings_category_badge_text_check') then
    alter table public.site_settings
      add constraint site_settings_category_badge_text_check
      -- Matches the admin field's maxLength; the badge is one short line.
      check (category_badge_text is null or char_length(category_badge_text) <= 24);
  end if;
end $$;

comment on column public.site_settings.category_badge is
  'Badge on the homepage category cards: status ("Open", no count), count (live places left) or custom (category_badge_text). Ten or fewer places left always shows the real count.';
comment on column public.site_settings.category_badge_text is
  'Badge text when category_badge is custom, e.g. "Few slots left". At most 24 characters.';

commit;
