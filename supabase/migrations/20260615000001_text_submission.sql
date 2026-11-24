-- ============================================================================
-- CS Sessions Hub — Text/Paste Submission Feature
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add submission_type to submissions table
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.submission_type as enum ('file', 'text');
exception when duplicate_object then null; end $$;

alter table public.submissions
  add column if not exists submission_type public.submission_type not null default 'file';

-- Ensure code_text exists (may already exist from earlier migrations)
alter table public.submissions
  add column if not exists code_text text;

-- ---------------------------------------------------------------------------
-- 2. Add allowed_submission_types to assignments table
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.allowed_submission_types as enum ('file', 'text', 'both');
exception when duplicate_object then null; end $$;

alter table public.assignments
  add column if not exists allowed_submission_types public.allowed_submission_types not null default 'both';

-- ---------------------------------------------------------------------------
-- 3. Update RLS policies (students can insert their own submissions of allowed types)
-- ---------------------------------------------------------------------------
-- The existing student insert policy already restricts to their own rows.
-- We add a check that the submission_type matches what the assignment allows.

drop policy if exists "submissions_student_insert_own" on public.submissions;
create policy "submissions_student_insert_own" on public.submissions
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'pending'
    and ai_score is null
    and final_score is null
    and similarity_flag = false
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and (a.deadline is null or a.deadline > now())
        and (
          a.allowed_submission_types = 'both'
          or a.allowed_submission_types = (select submission_type::text from (select new.submission_type as submission_type) t)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Backfill existing submissions
-- ---------------------------------------------------------------------------
update public.submissions
set submission_type = 'file'
where submission_type is null;

-- ---------------------------------------------------------------------------
-- 5. Notify PostgREST to reload schema
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';