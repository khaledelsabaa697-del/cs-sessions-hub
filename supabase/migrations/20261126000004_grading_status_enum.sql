-- ============================================================================
-- Grading automation — status enum values
--
-- Kept in its own migration because PostgreSQL cannot use a new enum value in
-- the same transaction that adds it. The rest of the grading automation lives
-- in 20261126000005_grading_automation.sql.
-- ============================================================================

alter type public.submission_status add value if not exists 'queued';
alter type public.submission_status add value if not exists 'grading';
alter type public.submission_status add value if not exists 'pending_retry';
alter type public.submission_status add value if not exists 'failed';

notify pgrst, 'reload schema';
