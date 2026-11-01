-- 0021_promo_videos.sql
--
-- Promo videos on the homepage, in a "Watch the Trail" band just below the
-- hero, edited in Admin -> Website:
--
--   1. promo_videos: one row per video, in display order.
--   2. site_settings gains the band's heading and the line under it.
--
-- The videos live on YouTube; a row holds only the 11-character video id.
-- The promos are high resolution, and YouTube streams them at whatever
-- quality each visitor's screen and connection can take, up to 4K, at no
-- cost to the site. Storage here caps uploads at 10 MB and bills every
-- download, so hosting the files ourselves is not an option. An unlisted
-- YouTube video embeds just as well as a public one.
--
-- The site's Content-Security-Policy already allows YouTube's player
-- (www.youtube-nocookie.com) and its thumbnails (i.ytimg.com).
--
-- Additive only: nothing on main reads the new table or columns, so this can
-- run before the matching frontend is deployed. Until it runs, the band stays
-- hidden and the admin section says it is waiting for this file. Safe to
-- re-run. Run after 0020.

-- ── 1. Promo videos ─────────────────────────────────────────────────────────
create table if not exists public.promo_videos (
  id            uuid primary key default gen_random_uuid(),
  youtube_id    text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title         text not null check (btrim(title) <> ''),
  caption       text,
  orientation   text not null default 'landscape'
                check (orientation in ('landscape', 'portrait')),
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.promo_videos is
  'Promo videos (YouTube) in the homepage band below the hero. Site-wide, not per edition. The first in display order is the one shown large.';
comment on column public.promo_videos.youtube_id is
  'The 11-character YouTube video id, e.g. dQw4w9WgXcQ from youtu.be/dQw4w9WgXcQ. Never a full URL, so a row can only ever embed a YouTube video.';
comment on column public.promo_videos.title is
  'Shown on the video and read out by screen readers.';
comment on column public.promo_videos.caption is
  'Optional line under the title, e.g. "Official teaser, 2026". NULL shows the title only.';
comment on column public.promo_videos.orientation is
  'landscape (16:9) or portrait (9:16, for a YouTube Short or a vertical reel).';
comment on column public.promo_videos.is_published is
  'false keeps a video that is not ready off the site. A hidden row is not readable with the public key.';

drop trigger if exists promo_videos_touch_updated_at on public.promo_videos;
create trigger promo_videos_touch_updated_at
  before update on public.promo_videos
  for each row execute function public.touch_updated_at();

-- Same shape as featured_guests (0020): a hidden video may be one that has
-- not been launched yet, and the anon key ships in the JavaScript bundle.
alter table public.promo_videos enable row level security;

drop policy if exists promo_videos_public_read  on public.promo_videos;
drop policy if exists promo_videos_admin_insert on public.promo_videos;
drop policy if exists promo_videos_admin_update on public.promo_videos;
drop policy if exists promo_videos_admin_delete on public.promo_videos;

create policy promo_videos_public_read on public.promo_videos
  for select using (is_published or public.is_admin());

create policy promo_videos_admin_insert on public.promo_videos
  for insert to authenticated with check (public.is_admin());

create policy promo_videos_admin_update on public.promo_videos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy promo_videos_admin_delete on public.promo_videos
  for delete to authenticated using (public.is_admin());

-- Second layer, independent of the policies above.
revoke insert, update, delete, truncate on public.promo_videos from anon;
grant select on public.promo_videos to anon, authenticated;
grant insert, update, delete on public.promo_videos to authenticated;

-- ── 2. The band's heading ───────────────────────────────────────────────────
alter table public.site_settings
  add column if not exists videos_heading text,
  add column if not exists videos_intro   text;

comment on column public.site_settings.videos_heading is
  'Heading of the homepage promo videos band. NULL reads "Watch the Trail". The last word is highlighted.';
comment on column public.site_settings.videos_intro is
  'Line under that heading. NULL uses a built-in line.';

-- The table's policies and grants from 0018 cover new columns too: everyone
-- reads, only an admin updates. Re-checked below.

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
      and tablename in ('site_settings', 'promo_videos')
      and cmd <> 'SELECT'
      and (roles = '{public}' or 'anon' = any (roles))
  loop
    problems := problems || E'\n  - policy reachable by anon: ' || bad;
  end loop;

  for bad in
    select table_name || ': ' || grantee || ' ' || privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('site_settings', 'promo_videos')
      and grantee = 'anon'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  loop
    problems := problems || E'\n  - still granted: ' || bad;
  end loop;

  if (select count(*) from public.site_settings) <> 1 then
    problems := problems || E'\n  - site_settings does not hold exactly one row';
  end if;

  if problems <> '' then
    raise exception E'0021 left something writable anonymously:%s', problems;
  end if;
end $$;
