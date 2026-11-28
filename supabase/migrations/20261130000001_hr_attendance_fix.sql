-- ============================================================================
-- HR attendance: idempotent repair migration
--
-- The HR attendance page needs:
--   * SELECT on public.sessions           (already granted to authenticated)
--   * SELECT on public.attendance         (policy includes HR)
--   * INSERT/UPDATE on public.attendance  (policy includes HR)
--   * public.hr_list_students()           (student list for the form)
--   * public.hr_find_students(uuid[], text[]) (validate saved student ids)
--
-- HR deliberately gets no SELECT on public.profiles (it contains emails) and
-- no write access to sessions, assignments, submissions, scores or users.
--
-- Safe to run more than once in the Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum values
-- ---------------------------------------------------------------------------
do $$ begin
  alter type public.user_role add value if not exists 'hr';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.attendance_status add value if not exists 'excused';
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Role helper (text comparison avoids "unsafe use of new enum value"
--    when this file also adds the enum value in the same transaction)
-- ---------------------------------------------------------------------------
create or replace function public.is_hr()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $hr$
begin
  return exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role::text = 'hr'
  );
end;
$hr$;

revoke all on function public.is_hr() from public;
grant execute on function public.is_hr() to authenticated;

-- Existing helper used by the attendance policies; recreate defensively.
create or replace function public.is_teacher_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $staff$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin'::public.user_role, 'teacher'::public.user_role)
  );
$staff$;

revoke all on function public.is_teacher_or_admin() from public;
grant execute on function public.is_teacher_or_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. HR student lookup RPCs (SECURITY DEFINER: return students only)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. Sessions: everyone signed in may read the session list (unchanged rule)
-- ---------------------------------------------------------------------------
drop policy if exists "sessions_select_authenticated" on public.sessions;
create policy "sessions_select_authenticated" on public.sessions
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 5. Attendance policies: admin + teacher + HR read/write; students read own
-- ---------------------------------------------------------------------------
drop policy if exists "attendance_admin_select_all"  on public.attendance;
drop policy if exists "attendance_admin_insert"      on public.attendance;
drop policy if exists "attendance_admin_update"      on public.attendance;
drop policy if exists "attendance_admin_delete"      on public.attendance;
drop policy if exists "attendance_teacher_select_all" on public.attendance;
drop policy if exists "attendance_teacher_insert"    on public.attendance;
drop policy if exists "attendance_teacher_update"    on public.attendance;
drop policy if exists "attendance_teacher_delete"    on public.attendance;
drop policy if exists "attendance_staff_select_all"  on public.attendance;
drop policy if exists "attendance_staff_insert"      on public.attendance;
drop policy if exists "attendance_staff_update"      on public.attendance;
drop policy if exists "attendance_staff_delete"      on public.attendance;

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

-- Students keep their own history (policy exists from the initial schema;
-- recreate idempotently in case it was dropped).
drop policy if exists "attendance_select_own" on public.attendance;
create policy "attendance_select_own" on public.attendance
  for select to authenticated
  using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. Table grants (RLS still decides which rows each role can touch)
-- ---------------------------------------------------------------------------
grant select (id, title, session_date, created_at, code_expires_at)
  on public.sessions to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Attendance audit trigger: deleting an attendance row must not try to
--    reference the row that was just deleted (latent FK violation that broke
--    "Not marked" / remove-attendance for every role).
-- ---------------------------------------------------------------------------
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
    -- attendance_id is null: the referenced attendance row no longer exists.
    insert into public.attendance_audit_log
      (attendance_id, session_id, student_id, changed_by, action, old_status, old_excused, old_note)
    values (null, OLD.session_id, OLD.student_id, v_actor, 'delete',
            OLD.status::text, OLD.excused, OLD.excuse_note);
    return OLD;
  end if;
  return null;
end;
$hr_audit$;

revoke all on function public.audit_attendance_change() from public;

drop trigger if exists attendance_audit_trigger on public.attendance;
create trigger attendance_audit_trigger
  after insert or update or delete on public.attendance
  for each row execute function public.audit_attendance_change();

notify pgrst, 'reload schema';
