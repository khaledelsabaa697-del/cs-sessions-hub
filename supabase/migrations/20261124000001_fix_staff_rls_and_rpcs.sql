-- ============================================================================
-- Fix: finish teacher/staff access and repair two broken RPCs.
--
-- 1. RLS: teachers need to read submissions + similarity pairs and to open the
--    signed file of a submission they review. Deleting an assignment also
--    removes its stored files, so staff need delete on that bucket.
-- 2. admin_analytics(): at_risk referenced a.avg_percent, but the average comes
--    from the joined avg_scores alias (av) — Postgres rejected the call with
--    "column a.avg_percent does not exist".
-- 3. admin_points_overview(): the OUT parameter attendance_points collided with
--    points_config.attendance_points ("column reference is ambiguous"), and the
--    rewrite also mis-computed weekly/streak points. Restored the canonical
--    formula from phase4 and kept the teacher gate.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. Staff can read every submission (admin SELECT survives, teacher needs it)
-- ---------------------------------------------------------------------------
drop policy if exists "submissions_teacher_select" on public.submissions;
create policy "submissions_teacher_select" on public.submissions
  for select to authenticated
  using (public.is_teacher_or_admin());

-- ---------------------------------------------------------------------------
-- 1b. Staff can read/insert/update/delete similarity pairs
-- ---------------------------------------------------------------------------
drop policy if exists "similarity_admin_all" on public.submission_similarity;
drop policy if exists "similarity_staff_all" on public.submission_similarity;
create policy "similarity_staff_all" on public.submission_similarity
  for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

-- ---------------------------------------------------------------------------
-- 1c. Staff can open/download submission files and clean them up
-- ---------------------------------------------------------------------------
drop policy if exists "submissions_read_own_or_admin" on storage.objects;
drop policy if exists "submissions_read_own_or_staff" on storage.objects;
create policy "submissions_read_own_or_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or public.is_teacher_or_admin()
    )
  );

drop policy if exists "submissions_admin_delete" on storage.objects;
drop policy if exists "submissions_staff_delete" on storage.objects;
create policy "submissions_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'submissions' and public.is_teacher_or_admin());

-- ---------------------------------------------------------------------------
-- 2. admin_analytics(): fix the at_risk alias so the RPC runs again
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics()
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
           a.attendance_percent, av.avg_percent
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
      and (a.attendance_percent < 70 or av.avg_percent < 60)
    order by a.attendance_percent asc nulls last, av.avg_percent asc nulls last
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

-- ---------------------------------------------------------------------------
-- 3. admin_points_overview(): unambiguous column names + correct weekly math
-- ---------------------------------------------------------------------------
create or replace function public.admin_points_overview()
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

  select greatest(date_trunc('week', now()), weekly_reset_at)
  into v_week_start
  from public.points_config
  where id = 1;

  return query
  with cfg as (
    select homework_weight as hw_weight,
           attendance_points as att_points,
           on_time_bonus as ontime_bonus,
           streak_bonus as streak_bonus
    from public.points_config
    where id = 1
  ),
  best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
    group by s.student_id, s.assignment_id
  ),
  hw as (
    select b.student_id, sum(b.best_score) * cfg.hw_weight as pts
    from best b cross join cfg
    group by b.student_id, cfg.hw_weight
  ),
  att as (
    select a.student_id,
           sum(
             case a.status
               when 'present' then cfg.att_points
               when 'late' then round(cfg.att_points / 2, 2)
               else 0
             end
           ) as pts,
           count(*) filter (where a.status in ('present', 'late')) as attended,
           count(*) filter (where a.status = 'late') as late
    from public.attendance a cross join cfg
    group by a.student_id
  ),
  ontime as (
    select b.student_id, count(*) * cfg.ontime_bonus as pts
    from best b
    cross join cfg
    join public.assignments a on a.id = b.assignment_id
    where a.deadline is not null
      and exists (
        select 1
        from public.submissions s2
        where s2.student_id = b.student_id
          and s2.assignment_id = b.assignment_id
          and s2.final_score is not null
          and s2.created_at <= a.deadline
      )
    group by b.student_id, cfg.ontime_bonus
  ),
  streak as (
    select x.student_id, max(x.run_len) as longest
    from (
      select g.student_id, g.grp, count(*) as run_len
      from (
        select a.student_id,
               s.session_date,
               s.session_date - (row_number() over (
                 partition by a.student_id order by s.session_date
               ))::int as grp
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where a.status in ('present', 'late')
      ) g
      group by g.student_id, g.grp
    ) x
    group by x.student_id
  ),
  badge_totals as (
    select sb.student_id, count(*) as badges
    from public.student_badges sb
    group by sb.student_id
  ),
  weekly as (
    select sp.student_id, sp.points
    from public.student_points(v_week_start) sp
  )
  select
    p.id,
    p.username,
    p.full_name,
    p.student_code,
    round(
      coalesce(hw.pts, 0)
      + coalesce(att.pts, 0)
      + coalesce(ontime.pts, 0)
      + floor(coalesce(st.longest, 0) / 5.0) * cfg.streak_bonus,
      2
    ) as total_points,
    round(coalesce(wk.points, 0), 2) as weekly_points,
    round(coalesce(hw.pts, 0), 2) as homework_points,
    round(coalesce(att.pts, 0), 2) as attendance_points,
    round(coalesce(ontime.pts, 0), 2) as on_time_points,
    round(floor(coalesce(st.longest, 0) / 5.0) * cfg.streak_bonus, 2) as streak_points,
    coalesce(att.attended, 0) as attended_count,
    coalesce(att.late, 0) as late_count,
    coalesce(st.longest, 0)::int as longest_streak,
    coalesce(bt.badges, 0) as badge_count,
    p.opted_out_of_leaderboard as opted_out
  from public.profiles p
  cross join cfg
  left join hw on hw.student_id = p.id
  left join att on att.student_id = p.id
  left join ontime on ontime.student_id = p.id
  left join streak st on st.student_id = p.id
  left join badge_totals bt on bt.student_id = p.id
  left join weekly wk on wk.student_id = p.id
  where p.role = 'student'
  order by total_points desc, p.display_name asc;
end;
$points_overview$;

-- ---------------------------------------------------------------------------
-- 4. generate_attendance_code(): teachers open check-in too, not just admins
--    (without this the action returns "forbidden" for every teacher)
-- ---------------------------------------------------------------------------
create or replace function public.generate_attendance_code(
  p_session_id uuid,
  p_minutes integer default 15
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $generate_code$
declare
  v_code    text;
  v_expires timestamptz;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_minutes < 1 or p_minutes > 240 then
    raise exception 'invalid_minutes' using errcode = '22023';
  end if;

  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           1 + floor(random() * 32)::int, 1), '')
  into v_code
  from generate_series(1, 6);

  v_expires := now() + make_interval(mins => p_minutes);

  update public.sessions
     set attendance_code = v_code,
         code_expires_at = v_expires
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  code := v_code;
  expires_at := v_expires;
  return next;
end;
$generate_code$;

revoke all on function public.generate_attendance_code(uuid, integer) from public;
grant execute on function public.generate_attendance_code(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Announcements: teachers publish/edit/delete too (missing on hosted DB)
-- ---------------------------------------------------------------------------
drop policy if exists "announcements_admin_insert" on public.announcements;
drop policy if exists "announcements_admin_update" on public.announcements;
drop policy if exists "announcements_admin_delete" on public.announcements;
drop policy if exists "announcements_teacher_insert" on public.announcements;
drop policy if exists "announcements_teacher_update" on public.announcements;
drop policy if exists "announcements_teacher_delete" on public.announcements;

create policy "announcements_teacher_insert" on public.announcements
  for insert to authenticated
  with check (public.is_teacher_or_admin());

create policy "announcements_teacher_update" on public.announcements
  for update to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

create policy "announcements_teacher_delete" on public.announcements
  for delete to authenticated
  using (public.is_teacher_or_admin());

-- Keep a public read policy so students see published announcements.
drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated" on public.announcements
  for select to authenticated
  using (true);

notify pgrst, 'reload schema';
