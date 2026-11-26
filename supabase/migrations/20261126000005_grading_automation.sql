-- ============================================================================
-- Automatic AI grading: durable job queue, dynamic model catalog, fallback
-- state, global gateway pacing, and grade metadata.
--
-- Additive only. No existing submission rows are backfilled or graded by this
-- migration; existing `pending` rows remain untouched and can still be queued
-- by a teacher from the assignment screen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Grade metadata on submissions
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists ai_provider text,
  add column if not exists ai_selected_model text,
  add column if not exists ai_attempts integer,
  add column if not exists ai_duration_ms integer,
  add column if not exists ai_prompt_tokens integer,
  add column if not exists ai_completion_tokens integer,
  add column if not exists ai_cost numeric(18, 10),
  add column if not exists ai_fallback_used boolean not null default false,
  add column if not exists ai_rubric jsonb;

-- The old queue index only covered `pending`. New work also waits in
-- queued/pending_retry and can be left failed for a teacher to review.
create index if not exists submissions_grading_queue_idx
  on public.submissions (created_at)
  where status in ('pending', 'queued', 'grading', 'pending_retry', 'failed');

-- ---------------------------------------------------------------------------
-- Grading settings (one row)
-- ---------------------------------------------------------------------------
create table if not exists public.grading_settings (
  id              smallint primary key default 1 check (id = 1),
  mode            text not null default 'auto_free'
                  check (mode in ('auto_free', 'manual_free', 'manual_paid')),
  preferred_model text,
  allow_paid      boolean not null default false,
  max_attempts    integer not null default 3
                  check (max_attempts between 1 and 10),
  updated_by      uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

insert into public.grading_settings (id)
values (1)
on conflict (id) do nothing;

-- Only an admin may flip the paid switch, even if a teacher reaches the
-- settings table directly through PostgREST.
create or replace function public.guard_grading_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard_settings$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and new.allow_paid is distinct from old.allow_paid
     and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$guard_settings$;

drop trigger if exists grading_settings_guard on public.grading_settings;
create trigger grading_settings_guard
  before update on public.grading_settings
  for each row execute function public.guard_grading_settings();

-- ---------------------------------------------------------------------------
-- Model catalog discovered from Kilo (pricing + capabilities)
-- ---------------------------------------------------------------------------
create table if not exists public.grading_models (
  id                   text primary key,
  display_name         text not null,
  provider             text not null,
  is_free              boolean not null default false,
  supports_json_mode   boolean not null default false,
  supports_structured  boolean not null default false,
  output_modalities    text[] not null default '{}',
  context_length       integer,
  max_completion_tokens integer,
  pricing_prompt       numeric(18, 10),
  pricing_completion   numeric(18, 10),
  pricing_request      numeric(18, 10),
  available            boolean not null default true,
  last_seen_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists grading_models_free_idx
  on public.grading_models (is_free, available, context_length desc);

-- ---------------------------------------------------------------------------
-- Per-model cooldown / availability state
-- ---------------------------------------------------------------------------
create table if not exists public.grading_model_state (
  model_id       text primary key,
  status         text not null default 'ok'
                 check (status in ('ok', 'rate_limited', 'unavailable')),
  cooldown_until timestamptz,
  failure_count  integer not null default 0,
  last_error     text,
  last_used_at   timestamptz,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Durable grading jobs (one active job per submission)
-- ---------------------------------------------------------------------------
create table if not exists public.grading_jobs (
  id                uuid primary key default gen_random_uuid(),
  submission_id     uuid not null unique
                    references public.submissions (id) on delete cascade,
  assignment_id     uuid not null
                    references public.assignments (id) on delete cascade,
  student_id        uuid not null
                    references public.profiles (id) on delete cascade,
  status            text not null default 'queued'
                    check (status in ('queued', 'running', 'succeeded', 'pending_retry', 'failed')),
  priority          integer not null default 0,
  attempts          integer not null default 0 check (attempts >= 0),
  max_attempts      integer not null default 3 check (max_attempts between 1 and 20),
  scheduled_at      timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  locked_at         timestamptz,
  locked_by         text,
  selected_model    text,
  actual_model      text,
  actual_provider   text,
  fallback_used     boolean not null default false,
  model_attempts    integer not null default 0,
  duration_ms       integer,
  prompt_tokens     integer,
  completion_tokens integer,
  cost              numeric(18, 10),
  last_error_code   text,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists grading_jobs_queue_idx
  on public.grading_jobs (scheduled_at, created_at)
  where status in ('queued', 'pending_retry');
create index if not exists grading_jobs_running_idx
  on public.grading_jobs (locked_at)
  where status = 'running';

-- ---------------------------------------------------------------------------
-- Global gateway pacing (shared by every serverless instance)
-- ---------------------------------------------------------------------------
create table if not exists public.grading_gate (
  id                smallint primary key default 1 check (id = 1),
  window_started_at timestamptz not null default now(),
  window_count      integer not null default 0,
  last_call_at      timestamptz,
  updated_at        timestamptz not null default now()
);

insert into public.grading_gate (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.grading_settings    enable row level security;
alter table public.grading_models      enable row level security;
alter table public.grading_model_state enable row level security;
alter table public.grading_jobs        enable row level security;
alter table public.grading_gate        enable row level security;

drop policy if exists "grading_settings_staff_select" on public.grading_settings;
create policy "grading_settings_staff_select" on public.grading_settings
  for select to authenticated
  using (public.is_teacher_or_admin());

drop policy if exists "grading_settings_staff_update" on public.grading_settings;
create policy "grading_settings_staff_update" on public.grading_settings
  for update to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

drop policy if exists "grading_models_staff_select" on public.grading_models;
create policy "grading_models_staff_select" on public.grading_models
  for select to authenticated
  using (public.is_teacher_or_admin());

drop policy if exists "grading_model_state_staff_select" on public.grading_model_state;
create policy "grading_model_state_staff_select" on public.grading_model_state
  for select to authenticated
  using (public.is_teacher_or_admin());

revoke all on public.grading_settings from anon, authenticated;
revoke all on public.grading_models from anon, authenticated;
revoke all on public.grading_model_state from anon, authenticated;
revoke all on public.grading_jobs from anon, authenticated;
revoke all on public.grading_gate from anon, authenticated;

grant select, update on public.grading_settings to authenticated;
grant select on public.grading_models to authenticated;
grant select on public.grading_model_state to authenticated;

grant all on public.grading_settings to service_role;
grant all on public.grading_models to service_role;
grant all on public.grading_model_state to service_role;
grant all on public.grading_jobs to service_role;
grant all on public.grading_gate to service_role;

-- ---------------------------------------------------------------------------
-- Enqueue: every new submission gets exactly one job; legacy/manual callers
-- can enqueue their own submission through the RPC.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_grading_job_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $enqueue_trigger$
begin
  insert into public.grading_jobs (submission_id, assignment_id, student_id, max_attempts)
  values (
    new.id,
    new.assignment_id,
    new.student_id,
    coalesce((select max_attempts from public.grading_settings where id = 1), 3)
  )
  on conflict (submission_id) do nothing;

  -- The insert policy requires `pending`, so the trigger advances the row
  -- after the policy has been evaluated.
  update public.submissions
     set status = 'queued'::public.submission_status
   where id = new.id
     and status = 'pending'::public.submission_status;

  return new;
end;
$enqueue_trigger$;

drop trigger if exists submissions_enqueue_grading on public.submissions;
create trigger submissions_enqueue_grading
  after insert on public.submissions
  for each row execute function public.enqueue_grading_job_after_insert();

create or replace function public.enqueue_grading_job(p_submission uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $enqueue_rpc$
declare
  v_student uuid;
  v_assignment uuid;
  v_id uuid;
begin
  select s.student_id, s.assignment_id
    into v_student, v_assignment
    from public.submissions s
   where s.id = p_submission;

  if v_student is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_student <> (select auth.uid()) and not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.grading_jobs as j (submission_id, assignment_id, student_id)
  values (p_submission, v_assignment, v_student)
  on conflict (submission_id) do update
    set status = case
                   when j.status in ('succeeded', 'failed') then 'queued'
                   else j.status
                 end,
        scheduled_at = least(j.scheduled_at, now()),
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$enqueue_rpc$;

revoke all on function public.enqueue_grading_job(uuid) from public, anon;
grant execute on function public.enqueue_grading_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Claim: only the service role may take jobs. SKIP LOCKED makes concurrent
-- workers safe; attempts are incremented inside the claim.
-- ---------------------------------------------------------------------------
create or replace function public.claim_grading_jobs(
  p_limit integer default 1,
  p_worker text default null
)
returns setof public.grading_jobs
language plpgsql
security definer
set search_path = ''
as $claim_jobs$
declare
  v_ids uuid[];
  v_subs uuid[];
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with picked as (
    select j.id
      from public.grading_jobs j
     where j.status in ('queued', 'pending_retry')
       and j.scheduled_at <= now()
     order by j.priority desc, j.scheduled_at asc, j.created_at asc
     for update skip locked
     limit greatest(1, least(10, coalesce(p_limit, 1)))
  ),
  claimed as (
    update public.grading_jobs j
       set status = 'running',
           attempts = j.attempts + 1,
           started_at = coalesce(j.started_at, now()),
           locked_at = now(),
           locked_by = coalesce(p_worker, 'worker'),
           last_error = null,
           last_error_code = null,
           updated_at = now()
      from picked p
     where j.id = p.id
     returning j.id, j.submission_id
  )
  select array_agg(id), array_agg(submission_id)
    into v_ids, v_subs
    from claimed;

  if v_ids is null then
    return;
  end if;

  update public.submissions s
     set status = 'grading'::public.submission_status
   where s.id = any (v_subs)
     and s.status in (
       'pending'::public.submission_status,
       'queued'::public.submission_status,
       'pending_retry'::public.submission_status,
       'failed'::public.submission_status
     );

  return query
    select *
      from public.grading_jobs
     where id = any (v_ids)
     order by priority desc, scheduled_at asc, created_at asc;
end;
$claim_jobs$;

revoke all on function public.claim_grading_jobs(integer, text) from public, anon, authenticated;
grant execute on function public.claim_grading_jobs(integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Recover interrupted workers
-- ---------------------------------------------------------------------------
create or replace function public.recover_stale_grading_jobs(
  p_stale_seconds integer default 300
)
returns integer
language plpgsql
security definer
set search_path = ''
as $recover_jobs$
declare
  v_count integer := 0;
  v_subs uuid[];
  v_failed uuid[];
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with stale as (
    select j.id
      from public.grading_jobs j
     where j.status = 'running'
       and j.locked_at < now() - make_interval(
         secs => greatest(30, coalesce(p_stale_seconds, 300))::double precision
       )
     for update skip locked
  ),
  recovered as (
    update public.grading_jobs j
       set status = case
                      when j.attempts >= j.max_attempts then 'failed'
                      else 'pending_retry'
                    end,
           scheduled_at = now(),
           locked_at = null,
           locked_by = null,
           finished_at = case
                           when j.attempts >= j.max_attempts then now()
                           else null
                         end,
           last_error_code = 'interrupted',
           last_error = 'The worker stopped before finishing this job.',
           updated_at = now()
      from stale s
     where j.id = s.id
     returning j.submission_id, j.status
  )
  select count(*),
         array_agg(submission_id),
         array_agg(submission_id) filter (where status = 'failed')
    into v_count, v_subs, v_failed
    from recovered;

  if coalesce(v_count, 0) = 0 then
    return 0;
  end if;

  update public.submissions s
     set status = case
                    when s.id = any (v_failed) then 'failed'::public.submission_status
                    else 'pending_retry'::public.submission_status
                  end
   where s.id = any (v_subs)
     and s.status = 'grading'::public.submission_status;

  return v_count;
end;
$recover_jobs$;

revoke all on function public.recover_stale_grading_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_stale_grading_jobs(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Global gateway slot: per-call spacing plus an hourly ceiling. Returns false
-- instead of throwing so the worker can schedule a later retry.
-- ---------------------------------------------------------------------------
create or replace function public.take_grading_slot(
  p_min_interval_ms integer default 250,
  p_hourly_limit integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $grading_slot$
declare
  v_ok boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.grading_gate
     set window_started_at = case
                               when window_started_at <= now() - interval '1 hour'
                                 then now()
                               else window_started_at
                             end,
         window_count = case
                          when window_started_at <= now() - interval '1 hour'
                            then 1
                          else window_count + 1
                        end,
         last_call_at = now(),
         updated_at = now()
   where id = 1
     and (
       last_call_at is null
       or last_call_at <= now() - make_interval(
            secs => greatest(0, coalesce(p_min_interval_ms, 250))::double precision / 1000.0
          )
     )
     and (
       window_started_at <= now() - interval '1 hour'
       or window_count < greatest(1, coalesce(p_hourly_limit, 180))
     )
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$grading_slot$;

revoke all on function public.take_grading_slot(integer, integer) from public, anon, authenticated;
grant execute on function public.take_grading_slot(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic model state updates used by the worker.
-- ---------------------------------------------------------------------------
create or replace function public.record_grading_model_failure(
  p_model text,
  p_status text,
  p_cooldown_seconds integer,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $model_failure$
declare
  v_status text;
  v_cooldown timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_status := case
                when p_status in ('rate_limited', 'unavailable') then p_status
                else 'unavailable'
              end;
  v_cooldown := now() + make_interval(
    secs => greatest(0, coalesce(p_cooldown_seconds, 120))::double precision
  );

  insert into public.grading_model_state
    (model_id, status, cooldown_until, failure_count, last_error, last_used_at, updated_at)
  values
    (p_model, v_status, v_cooldown, 1, left(coalesce(p_error, ''), 500), now(), now())
  on conflict (model_id) do update
    set status = excluded.status,
        cooldown_until = excluded.cooldown_until,
        failure_count = public.grading_model_state.failure_count + 1,
        last_error = excluded.last_error,
        last_used_at = now(),
        updated_at = now();
end;
$model_failure$;

revoke all on function public.record_grading_model_failure(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_grading_model_failure(text, text, integer, text)
  to service_role;

create or replace function public.record_grading_model_success(p_model text)
returns void
language plpgsql
security definer
set search_path = ''
as $model_success$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.grading_model_state
    (model_id, status, cooldown_until, failure_count, last_error, last_used_at, updated_at)
  values
    (p_model, 'ok', null, 0, null, now(), now())
  on conflict (model_id) do update
    set status = 'ok',
        cooldown_until = null,
        failure_count = 0,
        last_error = null,
        last_used_at = now(),
        updated_at = now();
end;
$model_success$;

revoke all on function public.record_grading_model_success(text)
  from public, anon, authenticated;
grant execute on function public.record_grading_model_success(text) to service_role;

-- ---------------------------------------------------------------------------
-- Keep the overview accurate for the new statuses.
-- ---------------------------------------------------------------------------
create or replace function public.admin_assignment_overview()
returns table (
  assignment_id uuid,
  attempt_count bigint,
  student_count bigint,
  pending_count bigint,
  graded_count bigint,
  flagged_count bigint,
  average_percent numeric,
  last_submission_at timestamptz,
  class_size bigint
)
language plpgsql
security definer
set search_path = ''
as $assignment_overview$
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with counts as (
    select s.assignment_id,
           count(*) as attempts,
           count(distinct s.student_id) as students,
           count(*) filter (
             where s.status in (
               'pending'::public.submission_status,
               'queued'::public.submission_status,
               'grading'::public.submission_status,
               'pending_retry'::public.submission_status,
               'failed'::public.submission_status
             )
           ) as pending,
           count(*) filter (where s.status = 'graded'::public.submission_status) as graded,
           count(*) filter (where s.status = 'flagged'::public.submission_status) as flagged,
           max(s.created_at) as last_at
    from public.submissions s
    group by s.assignment_id
  ),
  best as (
    select s.assignment_id,
           s.student_id,
           max(coalesce(s.final_score, s.ai_score)) as best_score
    from public.submissions s
    where coalesce(s.final_score, s.ai_score) is not null
    group by s.assignment_id, s.student_id
  ),
  averages as (
    select b.assignment_id,
           round(avg(b.best_score / nullif(a.max_score, 0)) * 100, 1) as avg_percent
    from best b
    join public.assignments a on a.id = b.assignment_id
    group by b.assignment_id
  )
  select a.id,
         coalesce(c.attempts, 0),
         coalesce(c.students, 0),
         coalesce(c.pending, 0),
         coalesce(c.graded, 0),
         coalesce(c.flagged, 0),
         av.avg_percent,
         c.last_at,
         (select count(*) from public.profiles p where p.role = 'student') as class_size
  from public.assignments a
  left join counts c on c.assignment_id = a.id
  left join averages av on av.assignment_id = a.id
  order by a.deadline asc nulls last, a.created_at desc;
end;
$assignment_overview$;

revoke all on function public.admin_assignment_overview() from public;
grant execute on function public.admin_assignment_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_analytics() counts "pending" as every ungraded/retrying state. Keep
-- the existing implementation intact and patch only that total.
-- ---------------------------------------------------------------------------
do $rename_analytics$
begin
  if to_regprocedure('public.admin_analytics_legacy()') is null
     and to_regprocedure('public.admin_analytics()') is not null then
    alter function public.admin_analytics() rename to admin_analytics_legacy;
  end if;
end;
$rename_analytics$;

create or replace function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $analytics_wrapper$
declare
  v_snapshot jsonb;
  v_pending bigint;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_snapshot := public.admin_analytics_legacy();

  select count(*)
    into v_pending
    from public.submissions
   where status in (
     'pending'::public.submission_status,
     'queued'::public.submission_status,
     'grading'::public.submission_status,
     'pending_retry'::public.submission_status,
     'failed'::public.submission_status
   );

  return jsonb_set(
    v_snapshot,
    '{totals,pending}',
    to_jsonb(coalesce(v_pending, 0)),
    true
  );
end;
$analytics_wrapper$;

revoke all on function public.admin_analytics() from public;
grant execute on function public.admin_analytics() to authenticated;

notify pgrst, 'reload schema';
