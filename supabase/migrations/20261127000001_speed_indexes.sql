-- Speed indexes for the most common sort/filter paths.
-- Additive only; safe to re-run.

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

create index if not exists submissions_student_created_idx
  on public.submissions (student_id, created_at desc);

create index if not exists student_warnings_student_created_idx
  on public.student_warnings (student_id, created_at desc);
