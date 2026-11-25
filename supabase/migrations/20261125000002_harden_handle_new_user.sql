-- ============================================================================
-- Harden handle_new_user(): never create a placeholder profile
-- ----------------------------------------------------------------------------
-- The trigger used to fall back to full_name = 'Student' and username = the
-- email prefix when raw_user_meta_data was missing. That let auth users created
-- outside the app (admin.generateLink magic links, dashboard "add user", any
-- future signInWithOtp) silently reappear as "Student" accounts after a delete.
--
-- Every legitimate path (signupAction, createStudentAccount, scripts/seed.mjs)
-- sends both username and full_name, so requiring them is safe. Anything else
-- now fails loudly instead of creating a junk profile.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username  text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_full_name text := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                                          new.raw_user_meta_data ->> 'display_name', '')), 80);
  v_display   text := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', v_full_name)), 80);
  v_role      public.user_role := 'student';
begin
  if v_username = '' or v_full_name = '' then
    raise exception 'handle_new_user: username and full_name metadata are required'
      using errcode = '22023';
  end if;

  if new.raw_app_meta_data ->> 'role' = 'admin' then
    v_role := 'admin';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username for auth user %', new.id using errcode = '22023';
  end if;

  insert into public.profiles (id, username, full_name, display_name, role)
  values (new.id, v_username, v_full_name, v_display, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

notify pgrst, 'reload schema';
