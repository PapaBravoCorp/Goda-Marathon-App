-- 0005_faqs_and_testimonials.sql
--
-- The last two hardcoded content blocks on the landing page.
--
-- The FAQ had drifted factually wrong: it advertised bib collection on
-- "August 7th and 8th" while the event moved to December, and described 15km
-- and 10km categories that do not exist in event_categories. The testimonials
-- were three invented five-star reviews with fabricated author names.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ── FAQs ────────────────────────────────────────────────────────────────────
create table if not exists public.faqs (
  id            uuid primary key default gen_random_uuid(),
  question      text not null,
  answer        text not null,
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.faqs is
  'Questions shown in the accordion on the landing page. Site-wide, not per-event.';
comment on column public.faqs.is_published is
  'Unpublished questions stay editable in admin but are hidden from visitors.';

-- ── Testimonials ────────────────────────────────────────────────────────────
create table if not exists public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  quote         text not null,
  author_name   text not null,
  author_role   text,
  rating        smallint check (rating is null or rating between 1 and 5),
  avatar_image  text,
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.testimonials is
  'Runner quotes for the landing page carousel. Intentionally seeded EMPTY: the
   previous hardcoded entries were fabricated, and the section hides itself
   until real quotes are added.';
comment on column public.testimonials.rating is
  'Optional 1-5 stars. NULL renders the quote without a star row.';

-- ── updated_at triggers (function created in 0003) ──────────────────────────
drop trigger if exists faqs_touch_updated_at on public.faqs;
create trigger faqs_touch_updated_at
  before update on public.faqs
  for each row execute function public.touch_updated_at();

drop trigger if exists testimonials_touch_updated_at on public.testimonials;
create trigger testimonials_touch_updated_at
  before update on public.testimonials
  for each row execute function public.touch_updated_at();

-- ── Row level security ──────────────────────────────────────────────────────
-- Matches the permissive model used across this schema; see the [AUTH]/[RLS]
-- TODOs in src/utils/services/*.js.
alter table public.faqs enable row level security;
alter table public.testimonials enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='faqs' and policyname='faqs_public_read') then
    create policy faqs_public_read on public.faqs for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='faqs' and policyname='faqs_anon_write') then
    create policy faqs_anon_write on public.faqs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='testimonials' and policyname='testimonials_public_read') then
    create policy testimonials_public_read on public.testimonials for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='testimonials' and policyname='testimonials_anon_write') then
    create policy testimonials_anon_write on public.testimonials for all using (true) with check (true);
  end if;
end $$;

-- ── Seed the FAQ, preserving your wording ───────────────────────────────────
-- Only runs while the table is empty, so it never overwrites later edits.
--
-- The two questions containing stale facts are inserted UNPUBLISHED. Their
-- original text is kept so you can correct a date rather than retype an answer,
-- but neither reaches visitors until you review and publish it. The two that
-- are still accurate go in published.
insert into public.faqs (question, answer, display_order, is_published)
select * from (values
  (
    'What is the minimum age to participate?',
    'Participants must be at least 16 years old on race day to run the 15km, and 12 years old for the 5km/10km categories.',
    1,
    false  -- REVIEW: references 15km/10km categories that are not configured
  ),
  (
    'When and where is the bib collection?',
    'Bib collection will be at the G5 Foundation Office in Nashik on August 7th and 8th. No bib collection will be available on race day.',
    2,
    false  -- REVIEW: August predates the current event date
  ),
  (
    'Are there aid stations on the route?',
    'Yes! There will be hydration and medical stations every 2.5km to ensure maximum safety and comfort during the race.',
    3,
    true
  ),
  (
    'What is the cancellation or refund policy?',
    'Registrations are non-refundable. However, you can transfer your bib to another runner up to 14 days before the event.',
    4,
    true
  )
) as seed(question, answer, display_order, is_published)
where not exists (select 1 from public.faqs);

do $$
declare hidden integer;
begin
  select count(*) into hidden from public.faqs where is_published = false;
  if hidden > 0 then
    raise notice
      'faqs: % question(s) seeded UNPUBLISHED because their answers contain stale facts. Review them under Admin -> Content before the demo.',
      hidden;
  end if;
end $$;
