-- Read-only diagnostic for the Supabase project's SQL editor.
-- Confirm the project matches NEXT_PUBLIC_SUPABASE_URL before running.
-- This reads object definitions only, never journal bodies or credentials.
-- NULL means a required object is absent; do not repair by resetting the DB.
begin read only;
select
  to_regclass('public.entries') as entries,
  to_regclass('public.preferences') as preferences,
  to_regclass('public.entry_receipts') as entry_receipts,
  to_regprocedure('public.get_preferences()') as get_preferences,
  to_regprocedure('public.publish_preferences(uuid,bigint,jsonb)') as publish_preferences,
  to_regprocedure('public.publish_entry(uuid,jsonb)') as publish_entry;
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'preferences' and column_name = 'version')
    or (table_name = 'entries' and column_name in ('revision_id', 'body_sha256', 'is_recovered')))
order by table_name, column_name;
commit;
