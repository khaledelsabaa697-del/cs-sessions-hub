-- ============================================================================
-- HR student lookup
-- HR does NOT get SELECT on public.profiles (it contains emails). These
-- security-definer RPCs return only id, full_name and student_code for
-- role = 'student', and are gated by is_hr() OR is_admin().
-- Also fixes hr_students_overview counting a phantom absence for students
-- with no eligible sessions.
-- ============================================================================

-- 1. Full student list (name + code only)
create or replace function public.hr_list_students()
returns table (
  id uuid,
  full_name text,
  student_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $hr_list_students$
begin
  if not (public.is_hr() or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.student_code
  from public.profiles p
  where p.role = 'student'::public.user_role
  order by p.full_name asc;
end;
$hr_list_students$;

revoke all on function public.hr_list_students() from public;
grant execute on function public.hr_list_students() to authenticated;

-- 2. Lookup by ids and/or student codes (attendance recording)
create or replace function public.hr_find_students(
  p_ids uuid[] default null,
  p_codes text[] default null
)
returns table (
  id uuid,
  full_name text,
  student_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $hr_find_students$
begin
  if not (public.is_hr() or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.student_code
  from public.profiles p
  where p.role = 'student'::public.user_role
    and (
      (p_ids is not null and p.id = any (p_ids))
      or (p_codes is not null and p.student_code = any (p_codes))
    )
  order by p.full_name asc;
end;
$hr_find_students$;

revoke all on function public.hr_find_students(uuid[], text[]) from public;
grant execute on function public.hr_find_students(uuid[], text[]) to authenticated;

-- 3. hr_students_overview: do not count the LEFT JOIN placeholder row as an
--    absence when a student has no eligible sessions (e.session_id is null).
create or replace function public.hr_students_overview(p_search text default null)
returns table (
  student_id uuid,
  full_name text,
  student_code text,
  sessions_attended int,
  sessions_absent int,
  excused_absences int,
  attendance_percent numeric,
  last_attended date,
  late_submissions int,
  missed_assignments int,
  warnings_count int,
  needs_warning boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $hr_overview_v2$
declare
  v_threshold int;
begin
  if not (public.is_hr() or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce((select value::int from public.app_settings where key = 'absence_threshold'), 3)
    into v_threshold;

  return query
  with students as (
    select p.id, p.full_name, p.student_code, p.created_at
    from public.profiles p
    where p.role = 'student'::public.user_role
      and (p_search is null or p_search = '' or
           lower(p.full_name) like '%' || lower(p_search) || '%' or
           lower(p.student_code) like '%' || lower(p_search) || '%')
  ),
  past_sessions as (
    select s.id as sid, s.session_date
    from public.sessions s
    where s.session_date < (now() at time zone 'utc')::date
  ),
  eligible as (
    select st.id as student_id, ps.sid as session_id, ps.session_date
    from students st
    cross join past_sessions ps
    where ps.session_date >= (st.created_at at time zone 'utc')::date
  ),
  att as (
    select a.student_id, a.session_id, a.status, a.excused
    from public.attendance a
  ),
  per_student as (
    select
      st.id as student_id,
      st.full_name,
      st.student_code,
      coalesce(count(*) filter (
        where e.session_id is not null and a.status in ('present','late')
      ), 0)::int as sessions_attended,
      coalesce(count(*) filter (
        where e.session_id is not null
          and (a.status is null or a.status in ('absent'))
          and coalesce(a.excused, false) = false
      ), 0)::int as sessions_absent,
      coalesce(count(*) filter (
        where e.session_id is not null and a.excused = true
      ), 0)::int as excused_absences,
      count(e.session_id)::int as eligible_count,
      max(case when a.status in ('present','late') then e.session_date end) as last_attended
    from students st
    left join eligible e on e.student_id = st.id
    left join att a on a.student_id = st.id and a.session_id = e.session_id
    group by st.id, st.full_name, st.student_code
  ),
  late_subs as (
    select s.student_id, count(distinct s.assignment_id)::int as late_count
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where a.deadline is not null
      and s.created_at > a.deadline
      and s.id in (
        select s2.id from public.submissions s2
        where s2.student_id = s.student_id and s2.assignment_id = s.assignment_id
        order by s2.created_at asc limit 1
      )
    group by s.student_id
  ),
  missed as (
    select st.id as student_id, count(*)::int as missed_count
    from students st
    cross join public.assignments a
    where a.deadline is not null
      and a.deadline < now()
      and a.created_at >= st.created_at
      and not exists (
        select 1 from public.submissions s
        where s.student_id = st.id and s.assignment_id = a.id
      )
    group by st.id
  ),
  warns as (
    select sw.student_id, count(*)::int as wcount
    from public.student_warnings sw
    group by sw.student_id
  )
  select
    ps.student_id,
    ps.full_name,
    ps.student_code,
    ps.sessions_attended,
    ps.sessions_absent,
    ps.excused_absences,
    case when ps.eligible_count > 0
         then round((ps.sessions_attended::numeric / ps.eligible_count) * 100, 1)
         else 0::numeric end as attendance_percent,
    ps.last_attended,
    coalesce(ls.late_count, 0)::int as late_submissions,
    coalesce(m.missed_count, 0)::int as missed_assignments,
    coalesce(w.wcount, 0)::int as warnings_count,
    (ps.sessions_absent >= v_threshold) as needs_warning
  from per_student ps
  left join late_subs ls on ls.student_id = ps.student_id
  left join missed m on m.student_id = ps.student_id
  left join warns w on w.student_id = ps.student_id
  order by ps.sessions_absent desc, ps.full_name asc;
end;
$hr_overview_v2$;

revoke all on function public.hr_students_overview(text) from public;
grant execute on function public.hr_students_overview(text) to authenticated;

notify pgrst, 'reload schema';
