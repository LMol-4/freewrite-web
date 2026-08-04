create extension if not exists pgcrypto;

create table public.entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  preview_text      text not null default '',
  word_count        integer not null default 0,
  char_count        integer not null default 0,
  storage_path      text not null,
  version           integer not null default 1,
  conflict_of       uuid references public.entries(id) on delete set null,
  deleted_at        timestamptz
);

-- the main list: newest first, conflicts and deletions excluded
create index entries_user_created_idx
  on public.entries (user_id, created_at desc)
  where deleted_at is null and conflict_of is null;

alter table public.entries enable row level security;

create policy entries_select on public.entries
  for select using (auth.uid() = user_id);
create policy entries_insert on public.entries
  for insert with check (auth.uid() = user_id);
create policy entries_update on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy entries_delete on public.entries
  for delete using (auth.uid() = user_id);
