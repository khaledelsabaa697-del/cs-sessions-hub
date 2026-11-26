-- ============================================================================
-- Least-privilege grants for HR tables.
-- Writes happen through SECURITY DEFINER functions / triggers:
--   attendance_audit_log  <- audit_attendance_change() trigger
--   student_warnings      <- hr_create_warning()
--   app_settings          <- hr_set_setting()
-- Direct DML grants are not needed by the app; keep SELECT only.
-- ============================================================================

-- The trigger runs as its owner; no INSERT policy is required.
drop policy if exists "audit_hr_admin_insert" on public.attendance_audit_log;

revoke insert, update, delete on public.attendance_audit_log from authenticated;
revoke insert, update, delete on public.student_warnings from authenticated;
revoke insert, update, delete on public.app_settings from authenticated;

grant select on public.attendance_audit_log to authenticated;
grant select on public.student_warnings to authenticated;
grant select on public.app_settings to authenticated;

notify pgrst, 'reload schema';
