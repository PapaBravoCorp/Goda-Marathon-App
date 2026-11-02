-- 0022_stats_viewers.sql
--
-- Stats-only logins for team members who need registration numbers but must
-- not see runners' personal data or get admin rights.
--
-- A stats viewer is a normal Supabase Auth user with an active row in
-- public.stats_viewers. The only thing that row unlocks is get_reg_stats(),
-- which returns counts and nothing else. Viewers get no access to any table:
-- they are not in admin_users, so is_admin() is false for them and every
-- existing policy keeps refusing them. Nothing existing is modified here --
-- not is_admin(), not admin_users, not any policy, not the registration or
-- payment functions.
--
-- Add, deactivate and remove viewers with the SQL snippets in the README
-- ("Stats viewers"). Rollback: supabase/rollbacks/0022_stats_viewers.down.sql.
-- Tests: supabase/tests/0022_stats_viewers.test.sql (README, "Database tests").
--
-- Safe to re-run. Wrapped in one transaction so it applies completely or not
-- at all, whichever way it is run (SQL editor, psql, or db push).

begin;

-- ── 1. Who may see the stats ────────────────────────────────────────────────

create table if not exists public.stats_viewers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text,
  active     boolean not null default true,
  created_at timestamptz default now()
);

comment on table public.stats_viewers is
  'Team members who may call get_reg_stats() and nothing more. Not admins: membership here grants no table access. Managed by hand in the SQL editor (see README, "Stats viewers").';
comment on column public.stats_viewers.active is
  'false = access withdrawn. Prefer this to deleting the row, so there is a record of who had access.';

-- RLS on with no policies: nobody can read or change this table through the
-- API. The grants are revoked as well, as a second layer, so a viewer cannot
-- even try to reactivate themselves. Only the SQL editor (or service_role)
-- manages it, the same way admin_users is managed.
alter table public.stats_viewers enable row level security;
revoke all on public.stats_viewers from anon, authenticated;

-- ── 2. The access check ─────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read stats_viewers, which the caller cannot.
-- Every name is schema-qualified and search_path is pinned, so a caller
-- cannot substitute their own objects (same reasoning as is_admin() in 0006).

create or replace function public.can_view_stats()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
      or exists (
           select 1
             from public.stats_viewers v
            where v.user_id = auth.uid()
              and v.active
         );
$$;

comment on function public.can_view_stats() is
  'True for an admin or an active stats viewer. Gates get_reg_stats(); grants nothing else.';

-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default, so revoking from public alone would leave anon able to call it.
revoke all on function public.can_view_stats() from public, anon;
grant execute on function public.can_view_stats() to authenticated;

-- ── 3. The stats ────────────────────────────────────────────────────────────
-- Counts only: no names, contacts, bibs or money. Two arrays:
--   breakdown  one row per (coupon code, category, payment status) with a count
--   daily      one row per (day entered, payment status) with a count. Days are
--              Indian time, so an 11:30 pm entry is counted on the right day.
-- payment_status is the entry's status now, not on the day it was made.

create or replace function public.get_reg_stats(p_event_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_view_stats() then
    raise exception 'You do not have access to registration stats.'
      using errcode = '42501';  -- insufficient_privilege: PostgREST answers 403
  end if;

  return jsonb_build_object(
    'event_id',     p_event_id,
    'generated_at', now(),
    'breakdown', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'coupon_code',    b.coupon_code,
                 'category',       b.category,
                 'payment_status', b.payment_status,
                 'count',          b.n
               )
               order by b.coupon_code nulls first, b.category, b.payment_status
             )
        from (
          select r.coupon_code, r.category, r.payment_status, count(*)::int as n
            from public.registrations r
           where r.event_id = p_event_id
           group by r.coupon_code, r.category, r.payment_status
        ) b
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'day',            d.day,
                 'payment_status', d.payment_status,
                 'count',          d.n
               )
               order by d.day, d.payment_status
             )
        from (
          select (r.created_at at time zone 'Asia/Kolkata')::date as day,
                 r.payment_status,
                 count(*)::int as n
            from public.registrations r
           where r.event_id = p_event_id
           group by 1, 2
        ) d
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_reg_stats(text) is
  'Registration counts for one event, for admins and active stats viewers. Aggregates only: coupon code x category x payment status, and per-day counts (Asia/Kolkata). No revenue, no row-level data.';

revoke all on function public.get_reg_stats(text) from public, anon;
grant execute on function public.get_reg_stats(text) to authenticated;

commit;
