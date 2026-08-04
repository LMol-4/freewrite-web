create table public.preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  theme             text not null default 'light'
                    check (theme in ('light', 'dark')),
  font              text not null default 'lato'
                    check (font in ('lato', 'system', 'serif', 'random')),
  font_size         integer not null default 18
                    check (font_size in (16, 18, 20, 22, 24, 26)),
  client_updated_at timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.preferences enable row level security;

create policy preferences_select on public.preferences
  for select using (auth.uid() = user_id);
create policy preferences_upsert on public.preferences
  for insert with check (auth.uid() = user_id);
create policy preferences_update on public.preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.touch_preferences()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger preferences_touch
  before update on public.preferences
  for each row execute function public.touch_preferences();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer            -- must insert for a user who isn't authenticated yet
set search_path = public    -- required: an unpinned search_path on a definer function is exploitable
as $$
begin
  insert into public.preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
