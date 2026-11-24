-- Fix: Allow teachers to use admin_similarity_pairs RPC
-- The function currently checks is_admin() but should allow teachers too.

create or replace function public.admin_similarity_pairs(p_assignment uuid)
returns table (
  pair_id           uuid,
  similarity        numeric,
  reviewed          boolean,
  created_at        timestamptz,
  submission_a      uuid,
  submission_b      uuid,
  student_a_name    text,
  student_a_username text,
  student_a_code    text,
  student_a_status  public.submission_status,
  student_b_name    text,
  student_b_username text,
  student_b_code    text,
  student_b_status  public.submission_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    ss.id,
    ss.similarity,
    ss.reviewed,
    ss.created_at,
    sa.id,
    sb.id,
    pa.full_name,
    pa.username,
    pa.student_code,
    sa.status,
    pb.full_name,
    pb.username,
    pb.student_code,
    sb.status
  from public.submission_similarity ss
  join public.submissions sa on sa.id = ss.submission_a
  join public.submissions sb on sb.id = ss.submission_b
  join public.profiles pa on pa.id = sa.student_id
  join public.profiles pb on pb.id = sb.student_id
  where ss.assignment_id = p_assignment
  order by ss.reviewed asc, ss.similarity desc;
end;
$$;

notify pgrst, 'reload schema';