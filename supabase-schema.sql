-- Lecture Shelf database schema
-- Run this in Supabase SQL Editor.

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  file_type text,
  file_size bigint,
  last_modified timestamptz,
  is_latest boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists classes_user_id_idx on public.classes(user_id);
create index if not exists lectures_class_id_idx on public.lectures(class_id);
create index if not exists lectures_user_id_idx on public.lectures(user_id);

alter table public.classes enable row level security;
alter table public.lectures enable row level security;

drop policy if exists "Users can view their classes" on public.classes;
create policy "Users can view their classes"
  on public.classes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their classes" on public.classes;
create policy "Users can create their classes"
  on public.classes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their classes" on public.classes;
create policy "Users can update their classes"
  on public.classes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their classes" on public.classes;
create policy "Users can delete their classes"
  on public.classes for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view their lectures" on public.lectures;
create policy "Users can view their lectures"
  on public.lectures for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their lectures" on public.lectures;
create policy "Users can create their lectures"
  on public.lectures for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their lectures" on public.lectures;
create policy "Users can update their lectures"
  on public.lectures for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their lectures" on public.lectures;
create policy "Users can delete their lectures"
  on public.lectures for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('lectures', 'lectures', false)
on conflict (id) do nothing;

drop policy if exists "Users can view their lecture files" on storage.objects;
create policy "Users can view their lecture files"
  on storage.objects for select
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload lecture files" on storage.objects;
create policy "Users can upload lecture files"
  on storage.objects for insert
  with check (bucket_id = 'lectures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their lecture files" on storage.objects;
create policy "Users can update their lecture files"
  on storage.objects for update
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their lecture files" on storage.objects;
create policy "Users can delete their lecture files"
  on storage.objects for delete
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = auth.uid()::text);
