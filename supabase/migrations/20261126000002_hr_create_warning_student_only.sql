-- ============================================================================
-- hr_create_warning: only real students may receive a manual warning.
-- Keeps the HR/admin gate; adds a role='student' check on the target profile.
-- ============================================================================

create or replace function public.hr_create_warning(
  p_student_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $hr_create_warning_student_only$
declare
  v_id uuid;
begin
  if not (public.is_hr() or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_student_id
      and p.role = 'student'::public.user_role
  ) then
    raise exception 'not_student' using errcode = '22023';
  end if;

  insert into public.student_warnings (student_id, reason, note, created_by)
  values (p_student_id, trim(p_reason), nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$hr_create_warning_student_only$;

revoke all on function public.hr_create_warning(uuid, text, text) from public;
grant execute on function public.hr_create_warning(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
