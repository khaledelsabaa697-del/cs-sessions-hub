-- ============================================================================
-- Session materials: files, videos, text, images, notebooks, code for a session
-- ============================================================================

create table if not exists public.session_materials (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  type        text not null check (type in ('text', 'file', 'image', 'video', 'notebook', 'code')),
  title       text not null,
  content     text,
  file_path   text,
  mime_type   text,
  language    text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists session_materials_session_idx
  on public.session_materials (session_id, created_at desc);

alter table public.session_materials enable row level security;

drop policy if exists "materials_staff_all" on public.session_materials;
create policy "materials_staff_all" on public.session_materials
  for all to authenticated
  using (public.is_teacher_or_admin())
  with check (public.is_teacher_or_admin());

drop policy if exists "materials_student_select" on public.session_materials;
create policy "materials_student_select" on public.session_materials
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Storage bucket for session materials
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('session-materials', 'session-materials', false, 52428800)
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800;

drop policy if exists "materials_student_read" on storage.objects;
create policy "materials_student_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'session-materials');

drop policy if exists "materials_staff_upload" on storage.objects;
create policy "materials_staff_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'session-materials' and public.is_teacher_or_admin());

drop policy if exists "materials_staff_delete" on storage.objects;
create policy "materials_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'session-materials' and public.is_teacher_or_admin());

notify pgrst, 'reload schema';
