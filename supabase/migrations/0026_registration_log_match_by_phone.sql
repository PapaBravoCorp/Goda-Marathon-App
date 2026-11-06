-- 0026_registration_log_match_by_phone.sql
--
-- Run after 0025. Admin -> Activity: someone who failed and then got in with a
-- different email is no longer listed as needing follow-up.
--
-- 0025 decided "has an entry now" by email alone. On this event a runner whose
-- first address was refused registered minutes later with another one, and
-- stayed on the follow-up list. A person is now matched by email OR by the
-- last ten digits of their phone, and each row says which address holds the
-- live entry (live_entry_email), so the organiser can see "got in as …".
--
-- Replaces admin_registration_log() only; the table, the public logging
-- function and the grants are unchanged. Safe to re-run.

begin;

-- The last ten digits of a phone number, or NULL when there are fewer: "+91
-- 98765 43210", "09876543210" and "9876543210" are the same phone.
create or replace function public._phone10(p text)
returns text
language sql
immutable
as $$
  select case when length(d) >= 10 then right(d, 10) end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- The email of a live entry (a registration, or a group this person
-- coordinates, that is not cancelled) for this person, matched by email or
-- by phone. NULL when there is none.
create or replace function public._live_entry_email(p_event_id text, p_email text, p_phone text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e from (
    select lower(r.email) as e, 1 as pref
      from public.registrations r
     where r.event_id = p_event_id
       and r.payment_status is distinct from 'CANCELLED'
       and (lower(r.email) = lower(p_email)
            or (public._phone10(p_phone) is not null and public._phone10(r.phone) = public._phone10(p_phone)))
    union all
    select lower(g.captain_email), 2
      from public.registration_groups g
     where g.event_id = p_event_id
       and g.payment_status is distinct from 'CANCELLED'
       and (lower(g.captain_email) = lower(p_email)
            or (public._phone10(p_phone) is not null and public._phone10(g.captain_phone) = public._phone10(p_phone)))
  ) m
  order by (e = lower(p_email)) desc, pref
  limit 1;
$$;

-- Helpers for admin_registration_log(), not for the API.
revoke all on function public._phone10(text) from public, anon, authenticated;
revoke all on function public._live_entry_email(text, text, text) from public, anon, authenticated;

create or replace function public.admin_registration_log(
  p_event_id   text,
  p_status     text    default null,
  p_stage      text    default null,
  p_search     text    default null,
  p_stuck_only boolean default false,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q     text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_rows  jsonb;
  v_total integer;
  v_summary jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  with logged as (
    select l.*,
           live.email is not null as has_live_entry,
           live.email as live_entry_email
      from public.registration_log l
      left join lateral (
        select public._live_entry_email(l.event_id, l.email, l.phone) as email
      ) live on true
     where l.event_id = p_event_id
       and (p_status is null or l.status = upper(p_status))
       and (p_stage is null or l.stage = upper(p_stage))
       and (v_q is null
            or lower(coalesce(l.email, '')) like '%' || v_q || '%'
            or lower(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')) like '%' || v_q || '%'
            or coalesce(l.phone, '') like '%' || v_q || '%'
            or lower(coalesce(l.code, '')) like '%' || v_q || '%'
            or lower(coalesce(l.client_id, '')) = v_q
            or lower(coalesce(l.error_message, '')) like '%' || v_q || '%')
  ),
  picked as (
    select * from logged
     where not p_stuck_only
    union all
    select * from (
      select distinct on (lower(email)) *
        from logged
       where p_stuck_only and status = 'FAILED' and email is not null and not has_live_entry
       order by lower(email), created_at desc
    ) s
  )
  select (select count(*) from picked),
         coalesce((
           select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc)
             from (select * from picked
                    order by created_at desc, id desc
                    limit greatest(least(coalesce(p_limit, 100), 500), 1)
                   offset greatest(coalesce(p_offset, 0), 0)) x
         ), '[]'::jsonb)
    into v_total, v_rows;

  select jsonb_build_object(
           'total',      count(*),
           'failed',     count(*) filter (where l.status = 'FAILED'),
           'failed_24h', count(*) filter (where l.status = 'FAILED' and l.created_at > now() - interval '24 hours'),
           'ok_24h',     count(*) filter (where l.status = 'OK' and l.stage = 'SUBMIT' and l.created_at > now() - interval '24 hours'),
           'stuck',      (select count(distinct lower(f.email))
                            from public.registration_log f
                           where f.event_id = p_event_id and f.status = 'FAILED' and f.email is not null
                             and public._live_entry_email(f.event_id, f.email, f.phone) is null)
         )
    into v_summary
    from public.registration_log l
   where l.event_id = p_event_id;

  return jsonb_build_object('total', v_total, 'rows', v_rows, 'summary', v_summary);
end $$;

comment on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) is
  'Admin only. Pages through registration_log for an event, newest first. Each row carries has_live_entry and live_entry_email: the person (matched by email or phone) holds a live entry. p_stuck_only: the latest failure of each person who still has none. Also returns summary counts.';

revoke all on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_registration_log(text, text, text, text, boolean, integer, integer) to authenticated;

commit;
