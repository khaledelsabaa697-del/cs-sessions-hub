-- Fix: Allow teachers to use remaining admin RPC functions
-- These functions currently check is_admin() but should allow teachers too.
-- Must drop first because return types may have changed.
-- Using unique dollar-quote delimiters for each function to avoid nesting issues.

-- 1. Update admin_session_overview() to allow teachers
drop function if exists public.admin_session_overview();
create function public.admin_session_overview()
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
as $session_overview$
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.title,
    s.session_date,
    (s.attendance_code is not null and s.code_expires_at is not null and s.code_expires_at > now()) as code_active,
    s.code_expires_at,
    count(a.*) filter (where a.status = 'present') as present_count,
    count(a.*) filter (where a.status = 'late') as late_count,
    count(a.*) filter (where a.status = 'absent') as absent_count,
    count(a.*) as checked_in_count,
    (select count(*) from public.profiles p where p.role = 'student') as class_size
  from public.sessions s
  left join public.attendance a on a.session_id = s.id
  group by s.id
  order by s.session_date desc, s.created_at desc;
end;
$session_overview$;

-- 2. Update admin_student_metrics() to allow teachers
drop function if exists public.admin_student_metrics();
create function public.admin_student_metrics()
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
as $student_metrics$
begin
  if not public.is_teacher_or_admin() then
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
             max(coalesce(s.final_score, s.ai_score)) as best_score
      from public.submissions s
      where coalesce(s.final_score, s.ai_score) is not null
        and s.status = 'graded'
      group by s.student_id, s.assignment_id
    ),
    avg_scores as (
      select b.student_id,
             round(avg(b.best_score / nullif(a.max_score, 0)) * 100, 1) as avg_percent
      from best b
      join public.assignments a on a.id = b.assignment_id
      group by b.student_id
    )
    select p.id,
           coalesce(a.attended, 0),
           t.n as sessions_total,
           case when t.n > 0 then round(coalesce(a.attended, 0)::numeric / t.n * 100, 1) else 0 end as attendance_percent,
           av.avg_percent,
           a.last_attended_at
    from public.profiles p
    cross join totals t
    left join att a on a.student_id = p.id
    left join avg_scores av on av.student_id = p.id
    where p.role = 'student'
    order by p.full_name;
end;
$student_metrics$;

-- 3. Update admin_analytics() to allow teachers
drop function if exists public.admin_analytics();
create function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $analytics$
declare
  v_totals  jsonb;
  v_weeks   jsonb;
  v_grades  jsonb;
  v_at_risk jsonb;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
      from public.submissions s
      where coalesce(s.final_score, 0) > 0
      group by s.student_id, s.assignment_id
  ),
  avg_scores as (
    select b.student_id,
           round(avg(b.best_score / nullif(a.max_score, 0)) * 100, 1) as avg_percent
      from best b
      join public.assignments a on a.id = b.assignment_id
      group by b.student_id
  ),
  totals as (
    select
      (select count(*) from public.profiles where role = 'student') as students,
      (select count(*) from public.sessions) as sessions,
      (select count(*) from public.assignments) as assignments,
      (select count(*) from public.submissions) as submissions,
      (select count(*) from public.submissions where status = 'graded') as graded,
      (select count(*) from public.submissions where status = 'pending') as pending,
      (select count(*) from public.submissions where status = 'flagged') as flagged,
      (select count(*) from public.submission_similarity where reviewed = false) as unreviewed_pairs
  ),
  weeks as (
    select date_trunc('week', s.session_date)::date as week_start,
           count(distinct s.id) as sessions,
           count(a.*) filter (where a.status = 'present') as attended,
           count(a.*) filter (where a.status = 'late') as late,
           case when count(a.*) > 0
                then round(count(a.*) filter (where a.status in ('present', 'late'))::numeric / count(a.*) * 100, 1)
           end as attendance_percent
    from public.sessions s
    left join public.attendance a on a.session_id = s.id
    where s.session_date >= current_date - interval '8 weeks'
    group by 1
    order by 1 desc
    limit 8
  ),
  grades as (
    select
      case
        when avg_percent < 50 then 'below50'
        when avg_percent < 60 then 'from50'
        when avg_percent < 70 then 'from60'
        when avg_percent < 80 then 'from70'
        when avg_percent < 90 then 'from80'
        else 'from90'
      end as bucket,
      count(*) as count
    from avg_scores
    group by 1
  ),
  at_risk as (
    select p.full_name, p.username, p.student_code,
           a.attendance_percent, a.avg_percent
    from public.profiles p
    left join (
      select a.student_id,
             case when t.n > 0 then round(a.attended::numeric / t.n * 100, 1) else 0 end as attendance_percent
      from (
        select a.student_id,
               count(*) filter (where a.status in ('present', 'late')) as attended
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where s.session_date <= current_date
        group by a.student_id
      ) a
      cross join (select count(*)::bigint as n from public.sessions where session_date <= current_date) t
    ) a on a.student_id = p.id
    left join avg_scores av on av.student_id = p.id
    where p.role = 'student'
      and (a.attendance_percent < 70 or a.avg_percent < 60)
    order by a.attendance_percent asc nulls last, a.avg_percent asc nulls last
    limit 10
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'weeks', (select jsonb_agg(to_jsonb(w)) from weeks w),
    'grades', (select jsonb_agg(to_jsonb(g)) from grades g),
    'at_risk', (select jsonb_agg(to_jsonb(r)) from at_risk r)
  ) into v_totals;

  return v_totals;
end;
$analytics$;

-- 4. Update admin_points_overview() to allow teachers
drop function if exists public.admin_points_overview();
create function public.admin_points_overview()
returns table (
  student_id         uuid,
  username           text,
  full_name          text,
  student_code       text,
  total_points       numeric,
  weekly_points      numeric,
  homework_points    numeric,
  attendance_points  numeric,
  on_time_points     numeric,
  streak_points      numeric,
  attended_count     bigint,
  late_count         bigint,
  longest_streak     integer,
  badge_count        bigint,
  opted_out          boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $points_overview$
#variable_conflict use_column
declare
  v_week_start timestamptz;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Get the week start for weekly calculations
  select date_trunc('week', current_date) into v_week_start;

  return query
  with cfg as (
    select homework_weight, attendance_points, on_time_bonus, streak_bonus
    from public.points_config where id = 1
  ),
  -- Best graded attempt per assignment (within the period, when given).
  best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
      and (v_week_start is null or s.created_at >= v_week_start)
    group by s.student_id, s.assignment_id
  ),
  hw as (
    select b.student_id,
           sum(b.best_score) * (select homework_weight from cfg) as pts
    from best b
    group by b.student_id
  ),
  att as (
    select a.student_id,
           sum(case a.status
                 when 'present' then (select attendance_points from cfg)
                 when 'late'    then round((select attendance_points from cfg) / 2, 2)
                 else 0
               end) as pts
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    where v_week_start is null or s.session_date >= v_week_start::date
    group by a.student_id
  ),
  ontime as (
    select b.student_id,
           count(*) * (select on_time_bonus from cfg) as pts
    from best b
    join public.assignments a on a.id = b.assignment_id
    where a.deadline is not null
      and b.best_score = a.max_score
      and (v_week_start is null or b.created_at >= v_week_start)
    group by b.student_id
  ),
  streak as (
    select p.student_id,
           (select streak_bonus from cfg) * greatest(p.longest_streak - 1, 0) as pts
    from (
      select a.student_id,
             max(attended) as longest_streak
      from (
        select a.student_id,
               s.session_date,
               count(*) filter (where a.status in ('present', 'late')) over (partition by a.student_id order by s.session_date rows between unbounded preceding and current row) as attended
        from public.attendance a
        join public.sessions s on s.id = a.session_id
      ) a
      group by a.student_id
    ) p
  )
  select p.id,
         p.username,
         p.full_name,
         p.student_code,
         coalesce(h.pts, 0) + coalesce(a.pts, 0) + coalesce(o.pts, 0) + coalesce(s.pts, 0) as total_points,
         coalesce(h.pts, 0) as weekly_points,
         coalesce(h.pts, 0) as homework_points,
         coalesce(a.pts, 0) as attendance_points,
         coalesce(o.pts, 0) as on_time_points,
         coalesce(s.pts, 0) as streak_points,
         coalesce(att.attended, 0) as attended_count,
         coalesce(att.late, 0) as late_count,
         coalesce(st.longest_streak, 0) as longest_streak,
         (select count(*) from public.student_badges sb where sb.student_id = p.id) as badge_count,
         p.opted_out_of_leaderboard as opted_out
  from public.profiles p
  left join hw h on h.student_id = p.id
  left join att a on a.student_id = p.id
  left join ontime o on o.student_id = p.id
  left join streak s on s.student_id = p.id
  left join (
    select a.student_id,
           count(*) filter (where a.status in ('present', 'late')) as attended,
           count(*) filter (where a.status = 'late') as late
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    group by a.student_id
  ) att on att.student_id = p.id
  left join (
    select a.student_id,
           max(attended) as longest_streak
    from (
      select a.student_id,
             s.session_date,
             count(*) filter (where a.status in ('present', 'late')) over (partition by a.student_id order by s.session_date rows between unbounded preceding and current row) as attended
      from public.attendance a
      join public.sessions s on s.id = a.session_id
    ) a
    group by a.student_id
  ) st on st.student_id = p.id
  where p.role = 'student'
  order by total_points desc, p.full_name;
end;
$points_overview$;

-- 5. Notify PostgREST to reload schema
notify pgrst, 'reload schema';