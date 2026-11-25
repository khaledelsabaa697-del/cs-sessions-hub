-- ============================================================================
-- HR role: step 1 — add 'hr' to user_role enum.
-- Run this FIRST and let it commit before running 20261125000006.
-- (Postgres requires new enum values to be committed before they are used.)
-- ============================================================================
do $$ begin
  alter type public.user_role add value if not exists 'hr';
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
