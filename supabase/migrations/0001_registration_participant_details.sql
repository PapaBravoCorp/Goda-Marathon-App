-- 0001_registration_participant_details.sql
--
-- The registration form (src/pages/Register/StepOne.jsx) collects a set of
-- required participant details -- including safety-critical ones such as blood
-- group and emergency contact -- that had nowhere to land: addRegistration()
-- silently dropped them because these columns did not exist.
--
-- All columns are nullable: the table already holds rows from before this
-- migration, and those registrations genuinely have no value for these fields.
-- Treat NULL here as "collected before we stored it", not as "runner declined".
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) BEFORE
-- deploying the matching change to src/utils/services/registrations.js.

alter table public.registrations
  -- Contact
  add column if not exists phone                     text,

  -- Safety / medical
  add column if not exists blood_group               text,
  add column if not exists emergency_contact_name    text,
  add column if not exists emergency_contact_number  text,
  add column if not exists has_medical_condition     boolean not null default false,
  add column if not exists allergies                 text,

  -- Address
  add column if not exists city                      text,
  add column if not exists state                     text,
  add column if not exists pincode                   text,

  -- Optional / commercial
  add column if not exists club_name                 text,
  add column if not exists coupon_code               text,

  -- Consent record: which waivers were accepted, and when.
  add column if not exists waivers_accepted          boolean not null default false,
  add column if not exists waivers_accepted_at       timestamptz;

comment on column public.registrations.blood_group is
  'Self-reported by the participant at registration. Race-day medical use.';
comment on column public.registrations.emergency_contact_number is
  'Validated at registration to be a 10-digit IN mobile, distinct from phone.';
comment on column public.registrations.waivers_accepted is
  'True only when all four mandatory declarations were ticked (medical fitness, assumption of risk, refund policy, media consent).';
comment on column public.registrations.waivers_accepted_at is
  'Server-side timestamp of consent. NULL for rows created before this migration.';

-- Bib numbers are handed out to runners and looked up on results day; they
-- should not collide within an event. Existing data may already contain
-- duplicates (bibs were generated with Math.random()), so this is a plain
-- index rather than a unique constraint -- promote it to UNIQUE once the
-- existing rows have been de-duplicated.
create index if not exists registrations_event_bib_idx
  on public.registrations (event_id, bib);
