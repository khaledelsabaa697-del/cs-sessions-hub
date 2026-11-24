-- ============================================================================
-- CS Sessions Hub — Phase 2: sessions, attendance & student metrics helpers
-- File: supabase/migrations/20260201000000_phase2.sql
--
-- Run after 20260101000000_init.sql and 20260101000100_reference_data.sql.
-- Safe to re-run: functions are replaced.
-- ============================================================================
                                                        
-- ---------------------------------------------------------------------------
-- Admin session list with attendance counts.
-- Students already read sessions (without attendance_code); this RPC exists so
-- the teacher gets counts plus the "code is live" flag in one query instead of
-- fetching every attendance row into the app.
-- ---------------------------------------------------------------------------
create or replace function public.admin_session_overview()
returns table (
  id uuid,
  title text,
  session_date date,
  code_active boolean,
  code_expires_at timestamptz,
  present_count bigint,
  late_count bigint,
  absent_count bigint,
  checked_in_count bigint,
  class_size bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select s.id,
           s.title,
           s.session_date,
           (s.attendance_code is not null
             and s.code_expires_at is not null
             and s.code_expires_at > now()) as code_active,
           s.code_expires_at,
           count(a.id) filter (where a.status = 'present') as present_count,
           count(a.id) filter (where a.status = 'late') as late_count,
           count(a.id) filter (where a.status = 'absent') as absent_count,
           count(a.id) filter (where a.status in ('present', 'late')) as checked_in_count,
           (select count(*) from public.profiles p where p.role = 'student') as class_size
    from public.sessions s
    left join public.attendance a on a.session_id = s.id
    group by s.id
    order by s.session_date desc, s.created_at desc;
end;
$$;

revoke all on function public.admin_session_overview() from public;
revoke all on function public.admin_session_overview() from anon;
grant execute on function public.admin_session_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Per-student attendance + grade metrics for the teacher's class table.
-- A session counts towards the denominator only once its date has arrived,
-- matching the student dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.admin_student_metrics()
returns table (
  student_id uuid,
  attended bigint,
  sessions_total bigint,
  attendance_percent numeric,
  average_percent numeric,
  last_attended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    with totals as (
      select count(*)::bigint as n
      from public.sessions
      where session_date <= current_date
    ),
    att as (
      select a.student_id,
             count(*) filter (where a.status in ('present', 'late')) as attended,
             max(a.created_at) filter (where a.status in ('present', 'late')) as last_attended_at
      from public.attendance a
      join public.sessions s on s.id = a.session_id
      where s.session_date <= current_date
      group by a.student_id
    ),
    best as (
      select s.student_id,
             s.assignment_id,
             max(
               least(
                 100,
                 greatest(
                   0,
                   coalesce(s.final_score, 0) * 100.0 / nullif(a.max_score, 0)
                 )
               )
             ) as percent
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.final_score is not null
        and a.max_score > 0
      group by s.student_id, s.assignment_id
    ),
    scores as (
      select b.student_id, round(avg(b.percent), 1) as average_percent
      from best b
      group by b.student_id
    )
    select p.id,
           coalesce(att.attended, 0)::bigint,
           t.n,
           case
             when t.n = 0 then null
             else round(coalesce(att.attended, 0) * 100.0 / t.n)
           end,
           scores.average_percent,
           att.last_attended_at
    from public.profiles p
    cross join totals t
    left join att on att.student_id = p.id
    left join scores on scores.student_id = p.id
    where p.role = 'student'
    order by p.full_name;
end;
$$;

revoke all on function public.admin_student_metrics() from public;
revoke all on function public.admin_student_metrics() from anon;
grant execute on function public.admin_student_metrics() to authenticated;

notify pgrst, 'reload schema';
