-- Bind publication to the account captured by the caller, even if browser cookies
-- change between scheduling a pending patch and sending it.
drop function public.publish_preferences(bigint, jsonb);
create function public.publish_preferences(requested_user_id uuid, expected_version bigint, patch jsonb)
returns setof public.preferences
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or requested_user_id is distinct from uid then
    raise exception 'authentication required for this account' using errcode = '42501';
  end if;
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
revoke all on function public.publish_preferences(uuid, bigint, jsonb) from public, anon;
grant execute on function public.publish_preferences(uuid, bigint, jsonb) to authenticated;
