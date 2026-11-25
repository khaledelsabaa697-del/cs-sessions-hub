-- ============================================================================
-- HR role: attendance recording + warning decisions (step 2)
-- Run AFTER 20261125000005_hr_role_enum.sql has committed.
-- ============================================================================
-- 1. is_hr() helper
create or replace function public.is_hr()
returns boolean
language sql
stable
security definer
set search_path = ''
as $hr$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'hr'::public.user_role
  );
$hr$;

revoke all on function public.is_hr() from public;
grant execute on function public.is_hr() to authenticated;

-- 3. Excused absences on attendance
alter table public.attendance
  add column if not exists excused boolean not null default false,
  add column if not exists excuse_note text;

-- 4. Attendance audit log
create table if not exists public.attendance_audit_log (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references public.attendance(id) on delete set null,
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('insert','update','delete')),
  old_status text,
  new_status text,
  old_excused boolean,
  new_excused boolean,
  old_note text,
  new_note text,
  created_at timestamptz not null default now()
);

alter table public.attendance_audit_log enable row level security;

drop policy if exists "audit_hr_admin_select" on public.attendance_audit_log;
drop policy if exists "audit_hr_admin_insert" on public.attendance_audit_log;
create policy "audit_hr_admin_select" on public.attendance_audit_log
  for select to authenticated
  using (public.is_hr() or public.is_admin());

create policy "audit_hr_admin_insert" on public.attendance_audit_log
  for insert to authenticated
  with check (public.is_hr() or public.is_teacher_or_admin());

-- 5. Manual warnings log
create table if not exists public.student_warnings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.student_warnings enable row level security;

drop policy if exists "warnings_hr_admin_all" on public.student_warnings;
drop policy if exists "warnings_student_select_own" on public.student_warnings;
create policy "warnings_hr_admin_all" on public.student_warnings
  for all to authenticated
  using (public.is_hr() or public.is_admin())
  with check (public.is_hr() or public.is_admin());

create policy "warnings_student_select_own" on public.student_warnings
  for select to authenticated
  using (student_id = (select auth.uid()));

-- 6. App settings (absence threshold etc.)
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "settings_authenticated_read" on public.app_settings;
drop policy if exists "settings_admin_write" on public.app_settings;
create policy "settings_authenticated_read" on public.app_settings
  for select to authenticated
  using (true);

create policy "settings_admin_write" on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.app_settings (key, value)
values ('absence_threshold', '3')
on conflict (key) do nothing;

-- 7. HR students overview RPC
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
as $hr_overview$
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
      coalesce(count(*) filter (where a.status in ('present','late')), 0)::int as sessions_attended,
      coalesce(count(*) filter (where (a.status is null or a.status in ('absent')) and coalesce(a.excused,false) = false), 0)::int as sessions_absent,
      coalesce(count(*) filter (where a.excused = true), 0)::int as excused_absences,
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
$hr_overview$;

revoke all on function public.hr_students_overview(text) from public;
grant execute on function public.hr_students_overview(text) to authenticated;

-- 8. HR student detail RPC
create or replace function public.hr_student_detail(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $hr_detail$
declare
  v_result jsonb;
begin
  if not (public.is_hr() or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'student_code', p.student_code,
      'created_at', p.created_at
    ),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'session_id', s.id,
        'title', s.title,
        'session_date', s.session_date,
        'status', coalesce(a.status::text, 'absent'),
        'excused', coalesce(a.excused, false),
        'excuse_note', a.excuse_note
      ) order by s.session_date desc)
      from public.sessions s
      left join public.attendance a
        on a.session_id = s.id and a.student_id = p.id
      where s.session_date < (now() at time zone 'utc')::date
        and s.session_date >= (p.created_at at time zone 'utc')::date
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id', a.id,
        'title', a.title,
        'deadline', a.deadline,
        'state', case
          when sub.id is null and a.deadline < now() then 'missing'
          when sub.id is not null and a.deadline is not null and sub.created_at > a.deadline then 'late'
          when sub.id is not null then 'on_time'
          else 'pending'
        end
      ) order by a.deadline desc nulls last)
      from public.assignments a
      left join lateral (
        select s.id, s.created_at from public.submissions s
        where s.student_id = p.id and s.assignment_id = a.id
        order by s.created_at asc limit 1
      ) sub on true
      where a.created_at >= p.created_at
    ), '[]'::jsonb),
    'warnings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sw.id,
        'reason', sw.reason,
        'note', sw.note,
        'created_at', sw.created_at
      ) order by sw.created_at desc)
      from public.student_warnings sw
      where sw.student_id = p.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.profiles p
  where p.id = p_student_id and p.role = 'student'::public.user_role;

  if v_result is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$hr_detail$;

revoke all on function public.hr_student_detail(uuid) from public;
grant execute on function public.hr_student_detail(uuid) to authenticated;

-- 9. Create warning RPC
create or replace function public.hr_create_warning(
  p_student_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $hr_warn$
declare
  v_id uuid;
begin
  if not (public.is_hr() or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  insert into public.student_warnings (student_id, reason, note, created_by)
  values (p_student_id, trim(p_reason), nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$hr_warn$;

revoke all on function public.hr_create_warning(uuid, text, text) from public;
grant execute on function public.hr_create_warning(uuid, text, text) to authenticated;

-- 10. Excuse an absence RPC
create or replace function public.hr_excuse_absence(
  p_session_id uuid,
  p_student_id uuid,
  p_excused boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $hr_excuse$
begin
  if not (public.is_hr() or public.is_teacher_or_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.attendance
  set excused = p_excused,
      excuse_note = case when p_excused then nullif(trim(p_note), '') else null end
  where session_id = p_session_id and student_id = p_student_id;
  if not found then
    -- insert an absent record if none exists
    insert into public.attendance (session_id, student_id, status, excused, excuse_note, marked_by)
    values (p_session_id, p_student_id, 'absent', p_excused,
            case when p_excused then nullif(trim(p_note), '') else null end, 'admin');
  end if;
end;
$hr_excuse$;

revoke all on function public.hr_excuse_absence(uuid, uuid, boolean, text) from public;
grant execute on function public.hr_excuse_absence(uuid, uuid, boolean, text) to authenticated;

-- 11. Settings getter/setter (admin only for write)
create or replace function public.hr_get_setting(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $hr_getset$
  select value from public.app_settings where key = p_key;
$hr_getset$;

revoke all on function public.hr_get_setting(text) from public;
grant execute on function public.hr_get_setting(text) to authenticated;

create or replace function public.hr_set_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $hr_setset$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.app_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, (select auth.uid()), now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$hr_setset$;

revoke all on function public.hr_set_setting(text, text) from public;
grant execute on function public.hr_set_setting(text, text) to authenticated;

-- 12. Attendance audit trigger (logs inserts/updates/deletes by hr/teacher/admin)
create or replace function public.audit_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $hr_audit$
declare
  v_actor uuid := (select auth.uid());
begin
  if TG_OP = 'INSERT' then
    insert into public.attendance_audit_log
      (attendance_id, session_id, student_id, changed_by, action, new_status, new_excused, new_note)
    values (NEW.id, NEW.session_id, NEW.student_id, v_actor, 'insert',
            NEW.status::text, NEW.excused, NEW.excuse_note);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.attendance_audit_log
      (attendance_id, session_id, student_id, changed_by, action,
       old_status, new_status, old_excused, new_excused, old_note, new_note)
    values (OLD.id, NEW.session_id, NEW.student_id, v_actor, 'update',
            OLD.status::text, NEW.status::text, OLD.excused, NEW.excused,
            OLD.excuse_note, NEW.excuse_note);
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.attendance_audit_log
      (attendance_id, session_id, student_id, changed_by, action, old_status, old_excused, old_note)
    values (OLD.id, OLD.session_id, OLD.student_id, v_actor, 'delete',
            OLD.status::text, OLD.excused, OLD.excuse_note);
    return OLD;
  end if;
  return null;
end;
$hr_audit$;

drop trigger if exists attendance_audit_trigger on public.attendance;
create trigger attendance_audit_trigger
  after insert or update or delete on public.attendance
  for each row execute function public.audit_attendance_change();

-- 13. RLS: attendance already allows teacher/admin; extend to hr
-- (Drop and recreate the attendance policies to include hr)
-- We add hr to the existing teacher policies by recreating them.
-- For safety, drop the teacher policies and recreate including hr.
drop policy if exists "attendance_teacher_select_all" on public.attendance;
drop policy if exists "attendance_teacher_insert" on public.attendance;
drop policy if exists "attendance_teacher_update" on public.attendance;
drop policy if exists "attendance_teacher_delete" on public.attendance;
drop policy if exists "attendance_staff_select_all" on public.attendance;
drop policy if exists "attendance_staff_insert" on public.attendance;
drop policy if exists "attendance_staff_update" on public.attendance;
drop policy if exists "attendance_staff_delete" on public.attendance;

create policy "attendance_staff_select_all" on public.attendance
  for select to authenticated
  using (public.is_teacher_or_admin() or public.is_hr());

create policy "attendance_staff_insert" on public.attendance
  for insert to authenticated
  with check (public.is_teacher_or_admin() or public.is_hr());

create policy "attendance_staff_update" on public.attendance
  for update to authenticated
  using (public.is_teacher_or_admin() or public.is_hr())
  with check (public.is_teacher_or_admin() or public.is_hr());

create policy "attendance_staff_delete" on public.attendance
  for delete to authenticated
  using (public.is_teacher_or_admin() or public.is_hr());

-- 14. Grant table access
grant select, insert, update, delete on public.attendance_audit_log to authenticated;
grant select, insert, update, delete on public.student_warnings to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

notify pgrst, 'reload schema';
