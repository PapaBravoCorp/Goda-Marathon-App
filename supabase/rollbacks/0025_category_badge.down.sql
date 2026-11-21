-- Rollback for 0025_category_badge.sql.
--
-- Removes the category-card badge choice. The site then falls back to
-- "Open" with no count (the frontend's default when the column is missing);
-- to bring the live count back, deploy the previous frontend.
--
-- If the migration was applied with `supabase db push`, also mark it reverted
-- so a later push re-applies it:
--   npm run supabase -- migration repair --status reverted 0025
--
-- Kept outside supabase/migrations on purpose: anything in that folder is
-- applied by `db push`.

begin;

alter table public.site_settings
  drop constraint if exists site_settings_category_badge_check,
  drop constraint if exists site_settings_category_badge_text_check;

alter table public.site_settings
  drop column if exists category_badge,
  drop column if exists category_badge_text;

commit;
