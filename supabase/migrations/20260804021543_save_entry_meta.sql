create or replace function public.save_entry_meta(
  p_id                uuid,
  p_expected_version  integer,
  p_preview           text,
  p_word_count        integer,
  p_char_count        integer,
  p_client_updated_at timestamptz
) returns public.entries
language plpgsql
security invoker      -- RLS still applies; this is not a privilege escalation
as $$
declare result public.entries;
begin
  update public.entries
     set preview_text      = p_preview,
         word_count        = p_word_count,
         char_count        = p_char_count,
         client_updated_at = p_client_updated_at,
         updated_at        = now(),
         version           = version + 1
   where id = p_id
     and version = p_expected_version
     and deleted_at is null
  returning * into result;

  if not found then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  return result;
end;
$$;
