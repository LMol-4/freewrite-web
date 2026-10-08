-- MCP credentials are separate from Supabase sessions and never grant direct API access.
create table public.mcp_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation uuid not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  ciphertext text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);
alter table public.mcp_keys enable row level security;
revoke all on public.mcp_keys from public, anon, authenticated;
grant all on public.mcp_keys to service_role;

-- Compare-and-swap prevents concurrent generation/rotation from silently replacing a key.
create function public.replace_mcp_key(p_user_id uuid, p_expected uuid, p_generation uuid, p_hash text, p_ciphertext text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 814));
  if (select generation from public.mcp_keys where user_id = p_user_id) is distinct from p_expected then
    return false;
  end if;
  insert into public.mcp_keys(user_id, generation, key_hash, ciphertext)
    values(p_user_id, p_generation, p_hash, p_ciphertext)
    on conflict(user_id) do update set generation = excluded.generation, key_hash = excluded.key_hash,
      ciphertext = excluded.ciphertext, created_at = now(), last_used_at = null,
      window_started_at = now(), request_count = 0;
  return true;
end;
$$;

-- Atomic, shared rate limit; checking the current hash on every request makes rotation immediate.
create function public.authenticate_mcp_key(p_hash text)
returns table(account_id uuid, limited boolean) language plpgsql security definer set search_path = '' as $$
declare k public.mcp_keys;
begin
  select * into k from public.mcp_keys where key_hash = p_hash for update;
  if not found then return; end if;
  if k.window_started_at <= now() - interval '1 minute' then
    k.request_count := 0;
    k.window_started_at := now();
  end if;
  if k.request_count >= 120 then
    return query select k.user_id, true; return;
  end if;
  update public.mcp_keys set request_count = k.request_count + 1,
    window_started_at = k.window_started_at, last_used_at = now() where user_id = k.user_id;
  return query select k.user_id, false;
end;
$$;
revoke all on function public.replace_mcp_key(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.authenticate_mcp_key(text) from public, anon, authenticated;
grant execute on function public.replace_mcp_key(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.authenticate_mcp_key(text) to service_role;
