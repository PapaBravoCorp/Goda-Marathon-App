-- 0020_website_settings.sql
--
-- Branding and homepage settings that used to need a code change, edited
-- from the new Admin -> Website tab:
--
--   1. site_settings gains the header/footer logo and name, a homepage hero
--      logo, the Register Now attention effect, how the hero's Distances box
--      reads, the Event Details page heading, and the footer's contact
--      numbers, about line and copyright name.
--   2. featured_guests: well-known people shown with their photo in a
--      "Guests of Honour" band on the homepage.
--
-- Every new site_settings column is optional or has a default, so the site
-- looks the same as before until an admin fills something in, with two
-- exceptions that were asked for: the Distances box lists each distance
-- (3K · 5K · 10K ...) instead of a range, and the Register Now button
-- pulses. Both can be switched back in Admin -> Website.
--
-- Uploaded logos go to the existing past-events bucket under branding/, and
-- guest photos under guests/. 0009 already restricts writes there to admins,
-- so no new bucket or storage policy is needed.
--
-- Run BEFORE deploying the matching frontend. Until it runs, the Website tab
-- explains that it is waiting for this file and the site keeps its current
-- look. Safe to re-run. Run after 0019.

-- ── 1. Site settings ────────────────────────────────────────────────────────
alter table public.site_settings
  add column if not exists brand_logo          text,
  add column if not exists brand_logo_plate    text not null default 'light',
  add column if not exists brand_name          text,
  add column if not exists brand_name_visible  boolean not null default true,
  add column if not exists hero_logo           text,
  add column if not exists hero_logo_plate     text not null default 'none',
  add column if not exists hero_logo_placement text not null default 'replace',
  add column if not exists hero_cta_effect     text not null default 'pulse',
  add column if not exists hero_distances      text not null default 'list',
  add column if not exists hero_distances_text text,
  add column if not exists event_heading       text,
  add column if not exists footer_about        text,
  add column if not exists footer_copyright    text,
  add column if not exists footer_contacts     jsonb not null default '[]'::jsonb,
  add column if not exists guests_heading      text,
  add column if not exists guests_intro        text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_settings_brand_logo_url_check') then
    alter table public.site_settings
      add constraint site_settings_brand_logo_url_check
      check (brand_logo is null or brand_logo ~* '^(https?://|/)\S+$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'site_settings_hero_logo_url_check') then
    alter table public.site_settings
      add constraint site_settings_hero_logo_url_check
      check (hero_logo is null or hero_logo ~* '^(https?://|/)\S+$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'site_settings_logo_plates_check') then
    alter table public.site_settings
      add constraint site_settings_logo_plates_check
      check (brand_logo_plate in ('light', 'dark', 'none') and hero_logo_plate in ('light', 'dark', 'none'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'site_settings_hero_logo_placement_check') then
    alter table public.site_settings
      add constraint site_settings_hero_logo_placement_check
      check (hero_logo_placement in ('replace', 'above'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'site_settings_hero_cta_effect_check') then
    alter table public.site_settings
      add constraint site_settings_hero_cta_effect_check
      check (hero_cta_effect in ('pulse', 'glow', 'none'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'site_settings_hero_distances_check') then
    alter table public.site_settings
      add constraint site_settings_hero_distances_check
      check (hero_distances in ('list', 'range', 'custom'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'site_settings_footer_contacts_check') then
    alter table public.site_settings
      add constraint site_settings_footer_contacts_check
      -- CASE rather than AND: Postgres does not promise to test the type
      -- first, and jsonb_array_length raises an error on a non-array.
      check (case when jsonb_typeof(footer_contacts) = 'array'
                  then jsonb_array_length(footer_contacts) <= 6
                  else false end);
  end if;
end $$;

comment on column public.site_settings.brand_logo is
  'Logo beside the site name in the header, mobile menu and footer. NULL shows the built-in /banner/logo-mark.png.';
comment on column public.site_settings.brand_logo_plate is
  'Backing behind brand_logo: light (white plate, for dark artwork), dark (navy plate, for white artwork) or none.';
comment on column public.site_settings.brand_name is
  'Name beside the logo, e.g. "GODA EPIC TRAIL". NULL uses that default.';
comment on column public.site_settings.brand_name_visible is
  'false hides the name beside the logo, for a logo that already spells it out.';
comment on column public.site_settings.hero_logo is
  'Large logo in the homepage hero. NULL shows the headline text only.';
comment on column public.site_settings.hero_logo_plate is
  'Backing behind hero_logo: none for artwork made for dark photos, light or dark otherwise.';
comment on column public.site_settings.hero_logo_placement is
  'replace: the logo takes the headline''s place (the headline stays as text for screen readers and search engines). above: the logo sits above the headline.';
comment on column public.site_settings.hero_cta_effect is
  'Attention effect on the hero''s Register Now button: pulse, glow or none. Never plays for visitors who ask their device for reduced motion.';
comment on column public.site_settings.hero_distances is
  'How the hero''s Distances box reads: list (each distance, from the categories), range (3–21 km) or custom (hero_distances_text).';
comment on column public.site_settings.hero_distances_text is
  'Text for the Distances box when hero_distances is custom, e.g. "3K Obstacle · 5K · 10K · 15K · 21K".';
comment on column public.site_settings.event_heading is
  'Heading of the Event Details page. NULL uses the event name. The word "Trail" is highlighted.';
comment on column public.site_settings.footer_about is
  'Sentence under the logo in the footer. NULL uses the built-in "Bringing people together..." line.';
comment on column public.site_settings.footer_copyright is
  'Name after the year in the footer''s copyright line. NULL uses the organiser''s legal name. The policy pages keep the legal name either way.';
comment on column public.site_settings.footer_contacts is
  'Phone contacts under Contact & Support in the footer: [{"name","role","phone","whatsapp"}], at most 6.';
comment on column public.site_settings.guests_heading is
  'Heading of the homepage Guests of Honour band. NULL reads "Guests of Honour".';
comment on column public.site_settings.guests_intro is
  'Line under that heading. NULL uses a built-in line.';

-- The table's policies and grants from 0018 cover new columns too: everyone
-- reads, only an admin updates. Re-checked at the end of this file.

-- ── 2. Featured guests ──────────────────────────────────────────────────────
create table if not exists public.featured_guests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (btrim(name) <> ''),
  credential    text,
  badge         text,
  photo_url     text not null check (photo_url ~* '^(https?://|/)\S+$'),
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.featured_guests is
  'Well-known people shown with their photo in the homepage Guests of Honour band. Site-wide, not per edition.';
comment on column public.featured_guests.credential is
  'One line under the name saying who they are, e.g. "Olympic boxer". NULL shows the name only.';
comment on column public.featured_guests.badge is
  'Short label over the photo, e.g. "Chief Guest 2025". NULL shows none.';
comment on column public.featured_guests.is_published is
  'false keeps a guest who has not been announced yet off the site. Unlike site_settings, a hidden row is not readable with the public key.';

drop trigger if exists featured_guests_touch_updated_at on public.featured_guests;
create trigger featured_guests_touch_updated_at
  before update on public.featured_guests
  for each row execute function public.touch_updated_at();

-- Same shape as sponsors (0015): a hidden guest may be someone not yet
-- confirmed, and the anon key ships in the JavaScript bundle.
alter table public.featured_guests enable row level security;

drop policy if exists featured_guests_public_read  on public.featured_guests;
drop policy if exists featured_guests_admin_insert on public.featured_guests;
drop policy if exists featured_guests_admin_update on public.featured_guests;
drop policy if exists featured_guests_admin_delete on public.featured_guests;

create policy featured_guests_public_read on public.featured_guests
  for select using (is_published or public.is_admin());

create policy featured_guests_admin_insert on public.featured_guests
  for insert to authenticated with check (public.is_admin());

create policy featured_guests_admin_update on public.featured_guests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy featured_guests_admin_delete on public.featured_guests
  for delete to authenticated using (public.is_admin());

-- Second layer, independent of the policies above.
revoke insert, update, delete, truncate on public.featured_guests from anon;
grant select on public.featured_guests to anon, authenticated;
grant insert, update, delete on public.featured_guests to authenticated;

-- ── Assert the result ───────────────────────────────────────────────────────
do $$
declare
  bad      text;
  problems text := '';
begin
  for bad in
    select format('%s.%s (%s)', tablename, policyname, cmd)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('site_settings', 'featured_guests')
      and cmd <> 'SELECT'
      and (roles = '{public}' or 'anon' = any (roles))
  loop
    problems := problems || E'\n  - policy reachable by anon: ' || bad;
  end loop;

  for bad in
    select table_name || ': ' || grantee || ' ' || privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('site_settings', 'featured_guests')
      and grantee = 'anon'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  loop
    problems := problems || E'\n  - still granted: ' || bad;
  end loop;

  if (select count(*) from public.site_settings) <> 1 then
    problems := problems || E'\n  - site_settings does not hold exactly one row';
  end if;

  if problems <> '' then
    raise exception E'0020 left something writable anonymously:%s', problems;
  end if;
end $$;
