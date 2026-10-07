-- Preserve legacy rows/objects. Only the publication boundary accepts new writes.
alter table public.entries
  add column revision_id uuid,
  add column body_sha256 text,
  add column is_recovered boolean not null default false;
update public.entries set is_recovered = true where conflict_of is not null;
alter table public.entries add constraint entry_values check
  (version > 0 and word_count >= 0 and char_count >= 0) not valid;
alter table public.entries add constraint entry_revision check
  ((revision_id is null and body_sha256 is null) or
   (revision_id is not null and body_sha256 ~ '^[0-9a-f]{64}$' and
    storage_path = user_id::text || '/' || id::text || '/' || revision_id::text || '.md')) not valid;
create index entries_account_cursor on public.entries(user_id, created_at desc, id desc);
create table public.entry_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  primary key(user_id, mutation_id)
);
alter table public.entry_receipts enable row level security;
create policy receipts_read on public.entry_receipts for select to authenticated using (user_id = auth.uid());
revoke all on public.entry_receipts from anon, authenticated;
grant select on public.entry_receipts to authenticated;
revoke insert, update, delete on public.entries from anon, authenticated;
drop function public.save_entry_meta(uuid, integer, text, integer, integer, timestamptz);
drop policy notes_update on storage.objects;

-- Definer is necessary: clients may read rows but cannot bypass CAS/receipts.
create function public.publish_entry(p_mutation_id uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  who uuid := auth.uid();
  eid uuid := (p_request->>'id')::uuid;
  op text := p_request->>'operation';
  old public.entries;
  receipt public.entry_receipts;
  result jsonb;
  rev uuid := (p_request->>'revisionId')::uuid;
  parent uuid := (p_request->>'conflictOf')::uuid;
begin
  if who is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if eid is null or p_mutation_id is null or op is null or op not in ('create','update','delete') then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  -- Serialize both receipt replay and initially absent entry IDs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(who::text || p_mutation_id::text, 0));
  select * into receipt from public.entry_receipts where user_id = who and mutation_id = p_mutation_id;
  if found then
    if receipt.request <> p_request then raise exception 'mutation_mismatch' using errcode = '22023'; end if;
    return receipt.result;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(eid::text, 1));
  select * into old from public.entries where id = eid and user_id = who for update;
  if op = 'create' and exists(select 1 from public.entries where id = eid) then
    result := jsonb_build_object('status','conflict');
  elsif op <> 'create' and old.id is null then
    result := jsonb_build_object('status','missing');
  elsif op <> 'create' and old.deleted_at is not null then
    result := jsonb_build_object('status','deleted', 'entry', to_jsonb(old));
  elsif op <> 'create' and (p_request->>'expectedVersion')::integer is distinct from old.version then
    result := jsonb_build_object('status','conflict','entry',to_jsonb(old));
  else
    if op <> 'delete' then
      if rev is null or (p_request->>'sha256') is null or (p_request->>'sha256') !~ '^[0-9a-f]{64}$'
        or (p_request->>'path') is distinct from who::text || '/' || eid::text || '/' || rev::text || '.md'
        or coalesce((p_request->>'wordCount')::integer,-1) < 0 or coalesce((p_request->>'charCount')::integer,-1) < 0
        or p_request->>'preview' is null or length(p_request->>'preview') > 33
        or p_request->>'createdAt' is null or p_request->>'updatedAt' is null then
        raise exception 'invalid_revision' using errcode = '22023';
      end if;
      if parent is not null and not exists(select 1 from public.entries where id = parent and user_id = who) then
        raise exception 'invalid_recovery_parent' using errcode = '22023';
      end if;
    end if;
    if op = 'create' then
      insert into public.entries(id,user_id,created_at,client_updated_at,preview_text,word_count,char_count,storage_path,revision_id,body_sha256,is_recovered,conflict_of)
      values(eid,who,(p_request->>'createdAt')::timestamptz,(p_request->>'updatedAt')::timestamptz,p_request->>'preview',
        (p_request->>'wordCount')::integer,(p_request->>'charCount')::integer,p_request->>'path',rev,p_request->>'sha256',
        coalesce((p_request->>'recovered')::boolean,false),parent) returning * into old;
    elsif op = 'update' then
      if old.is_recovered then raise exception 'recovered_read_only' using errcode = '22023'; end if;
      if (p_request->>'createdAt')::timestamptz <> old.created_at or parent is distinct from old.conflict_of
        or coalesce((p_request->>'recovered')::boolean,false) <> old.is_recovered then
        raise exception 'immutable_identity' using errcode = '22023';
      end if;
      update public.entries set client_updated_at=(p_request->>'updatedAt')::timestamptz,updated_at=now(),
        preview_text=p_request->>'preview',word_count=(p_request->>'wordCount')::integer,char_count=(p_request->>'charCount')::integer,
        storage_path=p_request->>'path',revision_id=rev,body_sha256=p_request->>'sha256',version=version+1 where id=eid returning * into old;
    else
      update public.entries set deleted_at=now(),updated_at=now(),version=version+1 where id=eid returning * into old;
    end if;
    result := jsonb_build_object('status','ok','entry',to_jsonb(old));
  end if;
  insert into public.entry_receipts values(who,p_mutation_id,p_request,result);
  return result;
end;
$$;
revoke all on function public.publish_entry(uuid,jsonb) from public, anon;
grant execute on function public.publish_entry(uuid,jsonb) to authenticated;

