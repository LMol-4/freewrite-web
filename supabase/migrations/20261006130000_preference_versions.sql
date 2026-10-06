-- Forward-only: keep applied migrations and existing preference values.
alter table public.preferences add column version bigint not null default 1 check (version > 0);
insert into public.preferences (user_id) select id from auth.users on conflict do nothing;

create or replace function public.touch_preferences()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- Restrict application mutations to the conditional publication function.
revoke insert, update, delete on public.preferences from anon, authenticated;
create function public.publish_preferences(expected_version bigint, patch jsonb)
returns setof public.preferences
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(patch) <> 'object' or patch - array['theme','font','fontSize'] <> '{}'::jsonb then
    raise exception 'invalid preference patch' using errcode = '22023';
  end if;
  insert into public.preferences(user_id) values(uid) on conflict do nothing;
  return query update public.preferences p set
    theme = case when patch ? 'theme' then patch->>'theme' else p.theme end,
    font = case when patch ? 'font' then patch->>'font' else p.font end,
    font_size = case when patch ? 'fontSize' then (patch->>'fontSize')::integer else p.font_size end
  where p.user_id = uid and p.version = expected_version returning p.*;
end;
$$;
revoke all on function public.publish_preferences(bigint, jsonb) from public, anon;
grant execute on function public.publish_preferences(bigint, jsonb) to authenticated;

create function public.get_preferences()
returns setof public.preferences language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  insert into public.preferences(user_id) values(uid) on conflict do nothing;
  return query select * from public.preferences where user_id = uid;
end;
$$;
revoke all on function public.get_preferences() from public, anon;
grant execute on function public.get_preferences() to authenticated;
