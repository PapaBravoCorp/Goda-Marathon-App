-- 0024_drop_legacy_email_constraint.sql
--
-- Run after 0023. Lets a runner whose reservation lapsed register again.
--
-- The live registrations table carries a constraint that no migration created:
--
--   unique_email_per_event  UNIQUE (email, event_id)
--
-- It was added in the Supabase dashboard before the migrations existed. It
-- counts every row, cancelled ones included, so it contradicts 0011, which made
-- an email unique only among entries that are still live
-- (registrations_event_email_live_key). The result on production:
--
--   * A runner opens checkout, does not pay, and the reservation is cancelled
--     (PAYMENT_TIMEOUT), or they cancel it themselves (RUNNER_CANCELLED).
--   * They come back. is_email_registered() ignores cancelled rows, so the form
--     lets them through to the confirm step.
--   * create_registration() also ignores cancelled rows in its own check, then
--     the INSERT hits unique_email_per_event: 23505, HTTP 409.
--   * The message is "duplicate key value ... unique_email_per_event", not
--     ALREADY_REGISTERED, so the form shows its generic "Something went wrong
--     saving your registration" -- every time, on every retry, for good.
--   * The transaction rolls back, so nothing new appears in the admin panel.
--
-- On 6 Nov 2026 this was blocking 14 people (11 PAYMENT_TIMEOUT,
-- 3 RUNNER_CANCELLED), none of whom had a live entry.
--
-- registrations_event_email_live_key (0011) still guarantees one live entry
-- per email per event, case-insensitively, which the legacy constraint did not.
-- Dropping the legacy one loses no protection.
--
-- Safe to re-run.

alter table public.registrations
  drop constraint if exists unique_email_per_event;

-- The constraint's backing index goes with it. This catches the case where it
-- was created as a bare unique index rather than a constraint.
drop index if exists public.unique_email_per_event;
